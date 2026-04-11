import type { Metadata } from "next";
import { HomeLanding } from "@/components/HomeLanding";

export const metadata: Metadata = {
  title: "Bluvium",
  description:
    "会員・所属・資格・大会エントリー・決済を一気通貫で扱うプラットフォーム",
};

export default function Home() {
  return <HomeLanding />;
}
