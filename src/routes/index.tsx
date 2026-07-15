import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Petals } from "@/components/lumina/Petals";
import { LuminaLogo } from "@/components/lumina/LuminaLogo";
import { useAuth, bindAuthListener } from "@/lib/lumina-auth";

export const Route = createFileRoute("/")({
  component: Landing,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Lumina Evermore" },
      {
        name: "description",
        content: "Crafted with care 😸..... preserving the moments that mean the most to Shivani 😌.....",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Lumina Evermore" },
      {
        property: "og:description",
        content: "Crafted with care 😸.... preserving the moments that mean the most to Shivani 😌.....",
      },
      { property: "og:image", content: "https://lumina-evermore.vercel.app/og-shivani.jpg" },
      { property: "og:image:secure_url", content: "https://lumina-evermore.vercel.app/og-shivani.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:url", content: "https://lumina-evermore.vercel.app/" },
      { property: "og:site_name", content: "Lumina Evermore" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Lumina Evermore" },
      {
        name: "twitter:description",
        content: "Crafted with care 😸.... preserving the moments that mean the most to Shivani 😌.....",
      },
      { name: "twitter:image", content: "https://lumina-evermore.vercel.app/og-shivani.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://lumina-evermore.vercel.app/" }],
  }),
});

function Landing() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);

  useEffect(() => { bindAuthListener(); }, []);
  useEffect(() => {
    if (!loading && user) navigate({ to: "/app/home", replace: true });
  }, [user, loading, navigate]);
  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <Petals count={22} />

      {/* soft aurora */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 top-0 h-[520px] w-[520px] rounded-full bg-[oklch(0.9_0.12_340)] opacity-50 blur-3xl" />
        <div className="absolute -right-40 top-40 h-[560px] w-[560px] rounded-full bg-[oklch(0.9_0.1_300)] opacity-45 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[480px] w-[720px] rounded-full bg-[oklch(0.97_0.06_60)] opacity-70 blur-3xl" />
      </div>

      <div
        className="relative z-10 mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center px-5 py-16 text-center sm:px-6 sm:py-20"
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 3.5rem)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 3.5rem)",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 flex flex-col items-center gap-5"
        >
          <LuminaLogo size={88} className="h-[5.5rem] w-[5.5rem]" />
          <div className="glass inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs tracking-[0.24em] text-muted-foreground uppercase">
            <Sparkles className="h-3.5 w-3.5 text-[oklch(0.7_0.15_340)]" />
            Lumina Evermore
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1 }}
          className="font-display text-5xl leading-[1.05] tracking-tight text-foreground sm:text-7xl md:text-8xl"
        >
          Welcome Back,
          <br />
          <span className="text-gradient italic">Pookie</span>
          <motion.span
            aria-hidden
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.7, type: "spring" }}
            className="ml-3 inline-block"
          >
            🌸
          </motion.span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.35 }}
          className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Your cozy little corner of the internet.
          <br />
          Write freely. Dream boldly. Keep every memory safe.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mt-12"
        >
          <Link to="/auth" className="group inline-flex">
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="lumina-glow relative inline-flex items-center gap-3 overflow-hidden rounded-full px-9 py-4 text-sm font-medium text-white"
              style={{
                background:
                  "linear-gradient(120deg, oklch(0.72 0.16 340), oklch(0.68 0.14 290), oklch(0.72 0.16 340))",
                backgroundSize: "200% 100%",
                animation: "shimmer 4s linear infinite",
              }}
            >
              <LuminaLogo size={18} decorative className="h-4 w-4 rounded-md shadow-none" />
              Begin Writing
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </motion.span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="mt-24 font-hand text-2xl text-muted-foreground"
        >
          made with kindness, just for you ✿
        </motion.div>
      </div>
    </div>
  );
}
