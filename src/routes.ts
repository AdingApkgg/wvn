import { index, route, type RouteConfig } from "@react-router/dev/routes";
export default [
  index("routes/catalog.tsx"),
  route("s/:shareId", "routes/share.tsx"),
  route("share-admin", "routes/share-admin.tsx"),
  route("dash/:section?", "routes/dashboard.tsx"),
  route("u/:uid", "routes/user.tsx"),
  route("account", "routes/account.tsx"),
  route("content", "routes/content.tsx"),
  route("manage", "routes/manage.tsx"),
  route(":workId", "routes/work.tsx"),
  route(":workId/:slot", "routes/play.tsx"),
] satisfies RouteConfig;
