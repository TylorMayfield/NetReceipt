import { useEffect, useState } from "react";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Button, Dialog, Switch } from "@radix-ui/themes";
import { appVersion } from "./api";

export function AboutDialog({ telemetryEnabled, onTelemetryChange }: { telemetryEnabled: boolean; onTelemetryChange: (enabled: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("…");

  useEffect(() => {
    if (open) void appVersion().then(setVersion).catch(() => setVersion("Unknown"));
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger><button type="button" className="header-icon-button" aria-label="About and privacy" title="About and privacy"><InfoCircledIcon /></button></Dialog.Trigger>
      <Dialog.Content className="about-dialog-content" maxWidth="370px">
        <div className="about-brand"><NetReceiptMark /><div><Dialog.Title>NetReceipt</Dialog.Title><span>Version {version}</span></div></div>
        <Dialog.Description size="2">Private internet monitoring that turns connection measurements into useful evidence.</Dialog.Description>
        <div className="local-data-promise"><b>Your history stays on this device.</b><span>Monitored hosts, measurements, incidents, and exports are never uploaded.</span></div>
        <label className="telemetry-toggle about-telemetry"><span><b>Anonymous telemetry</b><small>Basic app opens and feature usage only</small></span><Switch aria-label="Anonymous telemetry" checked={telemetryEnabled} onCheckedChange={onTelemetryChange} /></label>
        <nav className="product-links" aria-label="Product links"><a href="https://www.tylor.nz/legal" target="_blank" rel="noreferrer">Privacy &amp; Terms</a><i aria-hidden="true">·</i><a href="https://ko-fi.com/tylormayfield" target="_blank" rel="noreferrer">Support development</a></nav>
        <div className="dialog-close-row"><Dialog.Close><Button variant="soft" color="gray">Done</Button></Dialog.Close></div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function NetReceiptMark() {
  return <svg className="about-mark" viewBox="0 0 28 28" aria-hidden="true"><path d="M3.5 15.5c3.7-6.3 6.8-6.3 10.2 0s6.8 6.3 10.8 0" /></svg>;
}
