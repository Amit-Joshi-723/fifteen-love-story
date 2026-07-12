import { createFileRoute } from "@tanstack/react-router";
import FifteenLove from "@/components/FifteenLove";

export const Route = createFileRoute("/")({
  component: FifteenLove,
  head: () => ({
    meta: [
      { title: "Fifteen Love — 25 Years Served" },
      {
        name: "description",
        content:
          "A data study of women's Grand Slam tennis. 25 years of finals, upsets, rivalries and geography.",
      },
      { property: "og:title", content: "Fifteen Love — 25 Years Served" },
      {
        property: "og:description",
        content: "A data study of women's Grand Slam tennis.",
      },
    ],
  }),
});