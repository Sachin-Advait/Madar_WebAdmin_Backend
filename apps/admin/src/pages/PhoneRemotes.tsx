import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gamepad2, KeyRound, Smartphone, X, XCircle } from "lucide-react";
import { API, request } from "../api";
import type { Role } from "../types";
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  Loading,
  PageHeading,
  Status,
  useFeedback,
} from "../components/Common";

type Pairing = {
  id: string;
  tvId: string;
  tvName: string;
  label: string;
  status: "pending" | "active" | "ended";
  createdAt: string;
  approvedAt: string | null;
  expiresAt: string;
  decidedBy: string | null;
  endedAt: string | null;
  endReason: string | null;
  tvOnline: boolean;
};
type Remotes = {
  approvalRequired: boolean;
  grantHours: number;
  pairings: Pairing[];
};
const when = (v: string | null) => (v ? new Date(v).toLocaleString() : "");
const ended: Record<string, string> = {
  rejected: "Rejected",
  revoked: "Revoked",
  expired: "Expired",
  unpaired: "Unpaired on phone",
  cancelled: "Cancelled on phone",
};

/** Admin Studio → Phone Remotes: approve, reject or revoke staff phones. */
export default function PhoneRemotes({ role }: { role: Role }) {
  const client = useQueryClient(),
    feedback = useFeedback();
  const { data, error, isLoading } = useQuery<Remotes>({
    queryKey: ["remote-pairings"],
    queryFn: () => request("/api/admin/remote-pairings"),
    refetchInterval: 3000,
  });
  const [busy, setBusy] = useState("");
  const canDecide = role === "admin";
  const { data: screens = [] } = useQuery({
    queryKey: ["screens"],
    queryFn: API.screens,
  });
  const [screenId, setScreenId] = useState("");
  const [shown, setShown] = useState<{
    code: string;
    tv: string;
    until: number;
    tvOnline: boolean;
  } | null>(null);
  async function showCode() {
    const target = screens.find((s) => s.id === screenId);
    if (!target) return;
    setBusy("code");
    try {
      const r = await request<{ code: string; ttl: number; tvOnline: boolean }>(
        `/api/admin/screens/${target.id}/remote-code`,
        { method: "POST", body: "{}" },
      );
      setShown({
        code: r.code,
        tv: target.name,
        until: Date.now() + r.ttl * 1000,
        tvOnline: r.tvOnline,
      });
    } catch (err) {
      feedback.error(err);
    } finally {
      setBusy("");
    }
  }
  async function act(p: Pairing, action: "approve" | "reject" | "revoke") {
    if (
      action === "revoke" &&
      !window.confirm(`Stop "${p.label}" from controlling ${p.tvName}?`)
    )
      return;
    setBusy(p.id + action);
    try {
      await request(`/api/admin/remote-pairings/${p.id}/${action}`, {
        method: "POST",
        body: "{}",
      });
      feedback.success(
        action === "approve"
          ? `${p.label} can now control ${p.tvName}`
          : action === "reject"
            ? "Request rejected"
            : "Phone revoked",
      );
    } catch (err) {
      feedback.error(err);
    } finally {
      setBusy("");
      await client.invalidateQueries({ queryKey: ["remote-pairings"] });
    }
  }
  const list = data?.pairings || [];
  const pending = list.filter((p) => p.status === "pending");
  const active = list.filter((p) => p.status === "active");
  const recent = list.filter((p) => p.status === "ended");
  const table = (rows: Pairing[], kind: "pending" | "active" | "ended") => (
    <div className="responsive-table">
      <table className="table">
        <thead>
          <tr>
            <th>PHONE</th>
            <th>TV</th>
            <th>
              {kind === "pending"
                ? "REQUESTED"
                : kind === "active"
                  ? "ALLOWED UNTIL"
                  : "ENDED"}
            </th>
            <th>STATUS</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="content-name">
                  <Smartphone size={18} />
                  <div>
                    <strong>{p.label}</strong>
                    <small>{p.decidedBy ? `by ${p.decidedBy}` : ""}</small>
                  </div>
                </div>
              </td>
              <td>
                {p.tvName}
                <br />
                <small className="table-muted">
                  {p.tvOnline ? "TV online" : "TV offline"}
                </small>
              </td>
              <td>
                {kind === "pending"
                  ? when(p.createdAt)
                  : kind === "active"
                    ? when(p.expiresAt)
                    : when(p.endedAt)}
              </td>
              <td>
                <Status
                  value={
                    kind === "pending"
                      ? "Pending"
                      : kind === "active"
                        ? "Active"
                        : ended[p.endReason || ""] || "Ended"
                  }
                />
              </td>
              <td>
                <div className="action-cell">
                  {kind === "pending" && (
                    <>
                      <Button
                        icon={Check}
                        disabled={!canDecide || !!busy}
                        loading={busy === p.id + "approve"}
                        onClick={() => act(p, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        icon={X}
                        disabled={!canDecide || !!busy}
                        loading={busy === p.id + "reject"}
                        onClick={() => act(p, "reject")}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {kind === "active" && (
                    <Button
                      variant="danger"
                      icon={XCircle}
                      disabled={!canDecide || !!busy}
                      loading={busy === p.id + "revoke"}
                      onClick={() => act(p, "revoke")}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <PageHeading
        eyebrow="TV EXPERIENCE / REMOTE"
        title="Phone Remotes"
        subtitle="Staff phones running MADAR Control Centre. A phone pairs with the code shown on a TV, then waits here for approval."
      />
      <div className="info-strip">
        <Gamepad2 size={18} />
        <span>
          {data?.approvalRequired === false
            ? "Approval is turned off (MADAR_REMOTE_APPROVAL=0): a correct TV code pairs a phone straight away."
            : "A phone can't control a TV until it is approved here."}{" "}
          Approved phones work for {data?.grantHours ?? 12} hours, then pair
          again. Show a code below, or press Menu on the TV's own remote.
        </span>
      </div>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : (
        <>
          <Card>
            <div className="card-head">
              <div>
                <h3>
                  <KeyRound size={16} /> Pairing code
                </h3>
                <p>
                  Shows a 6-digit code on the TV for 2 minutes. Type it in the
                  Control Centre app on the phone.
                </p>
              </div>
            </div>
            <div className="action-cell">
              <select
                aria-label="TV"
                value={screenId}
                onChange={(e) => setScreenId(e.target.value)}
              >
                <option value="">Choose a TV…</option>
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button
                icon={KeyRound}
                disabled={!canDecide || !screenId || !!busy}
                loading={busy === "code"}
                onClick={showCode}
              >
                Show code on TV
              </Button>
            </div>
            {shown && shown.until > Date.now() && (
              <p>
                <strong style={{ fontSize: 28, letterSpacing: 6 }}>
                  {shown.code.slice(0, 3)} {shown.code.slice(3)}
                </strong>{" "}
                for {shown.tv} until{" "}
                {new Date(shown.until).toLocaleTimeString()}
                {shown.tvOnline
                  ? ""
                  : " (the TV is offline, so it isn't showing the code)"}
              </p>
            )}
          </Card>
          <Card>
            <div className="card-head">
              <div>
                <h3>Waiting for approval</h3>
                <p>Requests expire after 5 minutes.</p>
              </div>
            </div>
            {pending.length ? (
              table(pending, "pending")
            ) : (
              <Empty
                title="No requests"
                description="When a phone enters a TV's code it appears here."
              />
            )}
          </Card>
          <Card>
            <div className="card-head">
              <div>
                <h3>Active phones</h3>
              </div>
            </div>
            {active.length ? (
              table(active, "active")
            ) : (
              <Empty
                title="No phones paired"
                description="Approved phones appear here until they expire or are revoked."
              />
            )}
          </Card>
          {recent.length > 0 && (
            <Card>
              <div className="card-head">
                <div>
                  <h3>Ended in the last day</h3>
                </div>
              </div>
              {table(recent, "ended")}
            </Card>
          )}
        </>
      )}
      {feedback.node}
    </>
  );
}
