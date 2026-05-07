import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { divers } from "@/lib/mock-data";

export default async function AmbassadorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const diver = divers.find((d) => d.username === username);
  if (!diver) notFound();

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
          <p className="text-muted-foreground">
            Sat hours: {diver.satHours} • Dive hours: {diver.diveHours} • {diver.location}
          </p>
          <p className="text-cyan-200">{diver.mobilizationNotice}</p>
          <div className="flex flex-wrap gap-2">
            {diver.certifications.map((cert) => (
              <Badge key={cert}>{cert}</Badge>
            ))}
          </div>
          <Button size="lg">Request full profile and contact</Button>
        </CardContent>
      </Card>
    </div>
  );
}
