import type { Request, Response } from "express";
import app from "../server/index.js";

export default function handler(request: Request, response: Response) {
  const path = request.query.path;
  if (typeof path === "string") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(request.query)) {
      if (key === "path") continue;
      if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, String(item)));
      } else if (value !== undefined) {
        query.append(key, String(value));
      }
    }
    const suffix = query.size ? `?${query.toString()}` : "";
    request.url = `/api/${path}${suffix}`;
  }
  return app(request, response);
}
