import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompetitionBasicInfoEditor from "./CompetitionBasicInfoEditor";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const initialData = {
  category: "プール",
  startDate: "2026-07-10",
  endDate: "2026-07-11",
  entryStartDate: "2026-07-01T06:00:00.000Z",
  entryEndDate: "2026-07-02T08:30:00.000Z",
  venue: "旧会場",
};

function mockSuccessfulFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({}),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CompetitionBasicInfoEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockReset();
  });

  it("does not send competition name when saving basic info", async () => {
    const fetchMock = mockSuccessfulFetch();
    render(
      <CompetitionBasicInfoEditor
        competitionId="competition-1"
        canEdit
        initialData={initialData}
      />
    );

    fireEvent.change(screen.getByLabelText(/開催場所/), {
      target: { value: "新会場" },
    });
    fireEvent.blur(screen.getByLabelText(/開催場所/));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      category: "プール",
      startDate: "2026-07-10",
      endDate: "2026-07-11",
      venue: "新会場",
    });
  });

  it("keeps entry period times when saving from the basic info card", async () => {
    const fetchMock = mockSuccessfulFetch();
    render(
      <CompetitionBasicInfoEditor
        competitionId="competition-1"
        canEdit
        initialData={initialData}
      />
    );

    const start = screen.getByLabelText("エントリー開始日時") as HTMLInputElement;
    const end = screen.getByLabelText("エントリー終了日時") as HTMLInputElement;
    expect(start.value).toBe("2026-07-01T15:00");
    expect(end.value).toBe("2026-07-02T17:30");

    fireEvent.change(end, { target: { value: "2026-07-03T18:45" } });
    fireEvent.blur(end);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      entryStartDate: "2026-07-01T06:00:00.000Z",
      entryEndDate: "2026-07-03T09:45:00.000Z",
    });
  });
});
