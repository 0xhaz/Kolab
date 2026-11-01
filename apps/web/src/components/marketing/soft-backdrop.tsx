export function SoftBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-violet-700/35 blur-[120px]" />
      <div className="absolute -right-40 top-40 h-[480px] w-[480px] rounded-full bg-pink-600/25 blur-[120px]" />
      <div className="absolute bottom-0 left-1/3 h-[360px] w-[520px] rounded-full bg-amber-500/10 blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{ backgroundImage: 'radial-gradient(rgb(255 255 255) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
    </div>
  );
}
