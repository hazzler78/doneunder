import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { jobs } from "@/lib/mock-data";

export default function JobsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Public Job Board (Teaser)</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((job) => (
          <Card key={job.id}>
            <CardHeader>
              <CardTitle>{job.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{job.description}</p>
              <p className="text-muted-foreground">{job.location}</p>
              <p className="text-cyan-300">Full details and applicant list require company plan.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
