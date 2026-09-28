import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ouicheur",
    short_name: "Ouicheur",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#fffaf6",
    theme_color: "#af4c6c",
    icons: [
      { src: "/icons/ouicheur-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/ouicheur-512.png", sizes: "512x512", type: "image/png" },
    ],
    share_target: {
      action: "/add",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
