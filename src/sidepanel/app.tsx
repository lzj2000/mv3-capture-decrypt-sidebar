// Demo card data.
const demoItems = [
  { id: 'req-1', method: 'GET', url: 'https://api.example.com/user' },
  { id: 'req-2', method: 'POST', url: 'https://api.example.com/login' }
]

// Render a demo row.
function renderDemoRow(item: { id: string; method: string; url: string }) {
  return (
    <div
      key={item.id}
      className="grid gap-1.5 rounded-xl bg-white px-3 py-2.5 shadow-md shadow-slate-200/60"
    >
      <span className="text-[11px] font-bold uppercase text-clay">{item.method}</span>
      <span className="break-all text-[13px] text-slate-700">{item.url}</span>
    </div>
  )
}

// Side panel demo view.
export function App() {
  return (
    <div className="p-4 text-ink">
      <header className="mb-4 rounded-xl bg-white px-4 py-3 shadow-lg shadow-slate-200/60">
        <div className="text-lg font-bold tracking-wide">Capture + Decrypt</div>
        <div className="mt-1 text-xs text-slate-500">DevTools panel demo</div>
      </header>
      <section className="grid gap-2.5">
        {demoItems.map(renderDemoRow)}
      </section>
    </div>
  )
}
