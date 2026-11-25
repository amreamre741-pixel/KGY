"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { IconAlert, IconX } from "./icons";

type State = { error?: string; ok?: boolean } | undefined;

/** A trigger button + modal form wired to a server action; closes itself on success. */
export default function FormDialog({
  trigger,
  title,
  action,
  children,
  triggerClass = "btn btn-secondary btn-sm",
  triggerId,
}: {
  trigger: ReactNode;
  title: string;
  action: (prev: State, fd: FormData) => Promise<State>;
  children: ReactNode;
  triggerClass?: string;
  triggerId?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <button className={triggerClass} type="button" onClick={() => ref.current?.showModal()} id={triggerId}>
        {trigger}
      </button>
      <dialog ref={ref} className="modal">
        <form action={formAction}>
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => ref.current?.close()} aria-label={t.common.close}>
              <IconX />
            </button>
          </div>
          <div className="modal-body">
            {state?.error && (
              <div className="alert alert-error" role="alert">
                <IconAlert />
                {state.error}
              </div>
            )}
            {children}
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" type="button" onClick={() => ref.current?.close()}>
              {t.common.cancel}
            </button>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "…" : t.common.save}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
