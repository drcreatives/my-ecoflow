import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { callback as googleDriveCallback } from "./googleDrive_http";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/google-drive/callback", method: "GET", handler: googleDriveCallback });

export default http;
