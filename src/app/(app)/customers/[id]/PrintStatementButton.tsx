"use client";

import { useI18n } from "@/lib/i18n/client";
import { IconPrinter } from "@/components/icons";

export default function PrintStatementButton() {
  const { t } = useI18n();
  return (
    <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
      <IconPrinter />
      {t.customers.printStatement}
    </button>
  );
}
