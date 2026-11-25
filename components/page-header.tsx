/**
 * Page title row from the designs: the title on the left and the page's own
 * controls (usually the platform switch) on the right. On a phone the title
 * is already in the top bar, so only the controls show here.
 */
export default function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <h1 className="hidden text-2xl font-bold tracking-tight text-foreground lg:block">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
