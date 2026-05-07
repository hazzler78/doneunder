import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { divers } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default async function AmbassadorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const diver = divers.find((d) => d.username === username);
  if (!diver) notFound();
  const satHours = diver.satHours > 0 ? diver.satHours.toLocaleString() : "Not declared";
  const diveHours = diver.diveHours > 0 ? diver.diveHours.toLocaleString() : "Not declared";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{diver.fullName}</h1>
              <p className="mt-2 text-cyan-200">{diver.headline}</p>
            </div>
            <Badge className={diver.availabilityStatus === "available" ? "bg-emerald-900/60" : ""}>
              {diver.availabilityStatus === "available" ? "Available Now" : "Deployed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{diver.bio}</p>
          <p className="text-muted-foreground">Sat hours: {satHours} • Dive hours: {diveHours} • {diver.location}</p>
          <p className="text-cyan-200">{diver.mobilizationNotice}</p>
          <div className="flex flex-wrap gap-2">
            {diver.certifications.map((cert) => (
              <Badge key={cert}>{cert}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg">Request full profile and contact</Button>
            {username === "gareth" ? (
              <a
                href="/cv/gareth-middleton"
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
              >
                Open CV (Print/PDF)
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
