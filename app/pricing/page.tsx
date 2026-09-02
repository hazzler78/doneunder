import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/site";

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl section-pad py-12 md:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Companies</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
          Hiring teams — talk to us.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Divers use doneunder.ai free. If you are a contractor or recruiter and want access to
          verified commercial diving talent, email us. Pricing is set with you, not on a public
          rate card yet.
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <a href={CONTACT_MAILTO}>
            <Button size="lg" className="w-full sm:w-auto">
              Email {CONTACT_EMAIL}
            </Button>
          </a>
          <Link href="/register">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              I am a diver
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          <a href={CONTACT_MAILTO} className="text-primary hover:underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
