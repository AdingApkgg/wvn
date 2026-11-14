import { isValidElement } from "react";
import * as layout from "@/lib/cover-layout";
import pkg from "../../../package.json" with { type: "json" };
import { view } from "./view";

class Account {
  constructor(public uid: number) {}
}
console.log(
  JSON.stringify({
    jsx: isValidElement(view),
    uid: new Account(7).uid,
    alias: typeof layout === "object",
    package: pkg.name,
    child: process.env.WVN_RUNNER_CHILD === "1",
  }),
);
