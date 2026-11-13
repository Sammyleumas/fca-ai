import { notFound } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const DOCS = {
  terms: {
    title: "Terms of Service",
    body: [
      "MindFlow is a study tool. You keep ownership of everything you upload, and you are responsible for having the right to upload it.",
      "AI-generated explanations, plans and questions can contain mistakes. Always check important facts against your original materials.",
      "Do not use MindFlow to upload unlawful content or to attempt to access other students' data.",
      "These terms are a placeholder for launch and must be reviewed by a qualified lawyer before MindFlow is offered commercially.",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      "Your materials are stored privately and are only accessible to your account. Download links are short-lived.",
      "Document text you choose to study with AI features is sent to our AI provider to generate responses. It is not used to show content to other users.",
      "You can export your data or permanently delete your account at any time from Settings.",
      "This policy is a placeholder for launch and must be reviewed by a qualified lawyer before MindFlow is offered commercially.",
    ],
  },
} as const;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const content = DOCS[doc as keyof typeof DOCS];
  if (!content) notFound();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <Link href="/" className="focus-ring inline-block rounded-xl">
        <Logo />
      </Link>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">{content.title}</h1>
      <div className="mt-6 space-y-4 text-fg-2">
        {content.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </main>
  );
}
