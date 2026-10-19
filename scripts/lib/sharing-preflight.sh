# Sourced by the remote-only preview starter. Never stop a process here.
preflight_listener(){
 local port="$1" record="$2" root="$3" expected="$4" listeners pids actual recorded
 listeners=$(ss -H -ltnp "sport = :$port") || return 1
 test -n "$listeners" || return 0
 pids=$(printf '%s\n' "$listeners" | sed -nE 's/.*pid=([0-9]+).*/\1/p' | sort -u)
 test -f "$record" || { echo "Unowned listener on $port"; return 1; }
 recorded=$(cat "$record")
 [[ "$recorded" =~ ^[0-9]+$ ]] && test "$pids" = "$recorded" || { echo "Listener PID mismatch on $port"; return 1; }
 test "$(readlink -f "/proc/$recorded/cwd")" = "$root" || { echo "Foreign listener cwd on $port"; return 1; }
 tr '\0' ' ' < "/proc/$recorded/cmdline" | rg -q -- "$expected" || { echo "Foreign listener command on $port"; return 1; }
}
