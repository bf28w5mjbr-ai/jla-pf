import { NextResponse } from "next/server";

const ZIPCLOUD_API_BASE = "https://zipcloud.ibsnet.co.jp/api/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zipcode = (searchParams.get("zipcode") ?? "").replace(/\D/g, "");

  if (!/^\d{7}$/.test(zipcode)) {
    return NextResponse.json(
      {
        message: "zipcode must be 7 digits",
        results: null,
      },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${ZIPCLOUD_API_BASE}?zipcode=${zipcode}`, {
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          message: "postal lookup upstream error",
          results: null,
        },
        { status: 502 }
      );
    }

    const data = await upstream.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("postal lookup failed", error);
    return NextResponse.json(
      {
        message: "postal lookup failed",
        results: null,
      },
      { status: 500 }
    );
  }
}
