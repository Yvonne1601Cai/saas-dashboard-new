"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiClientError } from "@/lib/api/client";
import { ROLES, type Role } from "@/lib/auth/roles";
import type { AdminUserView } from "@/lib/users/repository";
import { Badge, inputClass } from "./ui";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function UsersAdmin({ currentUid }: { currentUid: string }) {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ items: AdminUserView[] }>("/api/users") });
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const changeRole = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: Role }) =>
      api(`/api/users/${uid}`, { method: "PATCH", body: { role } }),
    onSuccess: async (_data, { role }) => {
      setMessage({ tone: "ok", text: `Role changed to ${role}. They will be signed out and must sign in again.` });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) =>
      setMessage({ tone: "error", text: error instanceof ApiClientError ? error.message : "Could not change the role." }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="text-sm text-slate-600">
          Admins can create, edit, delete and generate descriptions for products. Viewers have read-only access.
        </p>
      </div>

      <p role="status" className={`min-h-5 text-sm ${message?.tone === "error" ? "text-red-600" : "text-green-700"}`}>
        {message?.text}
      </p>

      {users.isPending ? (
        <p role="status" className="text-sm text-slate-600">Loading users…</p>
      ) : users.isError ? (
        <p role="alert" className="text-sm text-red-600">Could not load users.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <caption className="sr-only">Users and their roles</caption>
            <thead className="bg-slate-50">
              <tr>
                {["Email", "Role", "Last sign-in"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.data.items.map((user) => {
                const isSelf = user.uid === currentUid;
                return (
                  <tr key={user.uid}>
                    <th scope="row" className="px-3 py-3 text-left text-sm font-medium text-slate-900">
                      {user.email} {isSelf && <Badge tone="amber">you</Badge>}{" "}
                      {user.disabled && <Badge tone="gray">disabled</Badge>}
                    </th>
                    <td className="px-3 py-3">
                      <label className="sr-only" htmlFor={`role-${user.uid}`}>
                        Role for {user.email}
                      </label>
                      <select
                        id={`role-${user.uid}`}
                        value={user.role}
                        // You cannot change your own role: avoids locking the last admin out.
                        disabled={isSelf || changeRole.isPending}
                        onChange={(e) => changeRole.mutate({ uid: user.uid, role: e.target.value as Role })}
                        className={`${inputClass} w-32`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">
                      {user.lastSignInAt ? dateFormat.format(new Date(user.lastSignInAt)) : "Never"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
