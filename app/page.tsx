import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { divers, jobs } from "@/lib/mock-data";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-10 md:py-16">
      <section className="grid gap-8 rounded-2xl border border-border bg-[#061322]/90 p-8 md:grid-cols-2">
        <div className="space-y-5">
          <Badge>Trusted by offshore hiring managers</Badge>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            The premium commercial diving talent marketplace.
          </h1>
          <p className="text-muted-foreground">
            doneunder.ai connects saturation divers, underwater welders, NDT specialists, and
            offshore contractors with AI-powered matching and verification-first trust signals.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/diver">
              <Button size="lg">Join as Diver (Free)</Button>
            </Link>
            <Link href="/dashboard/company">
              <Button size="lg" variant="outline">
                For Companies
              </Button>
            </Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>8+ Demo Divers</CardTitle>
              <CardDescription>Verified sat and welding talent profiles.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>AI Matching</CardTitle>
              <CardDescription>Commercial diving terminology optimized prompts.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Urgent Jobs</CardTitle>
              <CardDescription>Short-notice campaigns surfaced first.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>GDPR-Ready</CardTitle>
              <CardDescription>EU region controls and auditable AI logs.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {jobs.map((job) => (
          <Card key={job.id}>
            <CardHeader>
              <CardTitle>{job.title}</CardTitle>
              <CardDescription>
                {job.location} • Starts {job.startDate}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{job.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {divers.slice(0, 4).map((diver) => (
          <Card key={diver.id}>
            <CardHeader>
              <CardTitle>{diver.fullName}</CardTitle>
              <CardDescription>{diver.headline}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{diver.location}</span>
              <Link href={`/${diver.username}`}>
                <Button variant="outline" size="sm">
                  View Ambassador Page
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
