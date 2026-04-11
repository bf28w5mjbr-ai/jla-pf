import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Bluvium",
  description:
    "会員・所属・資格・大会エントリー・決済を一気通貫で扱うプラットフォーム",
};

const COVER_PAGE_URL = "https://bluvium.jp/";

export default function Home() {
  redirect(COVER_PAGE_URL);
}
