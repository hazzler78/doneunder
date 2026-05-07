import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DiverDashboardPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Diver Dashboard (Free Forever)</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile and CV Manager</CardTitle>
            <CardDescription>Upload PDF CV and certification documents.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button>Upload CV / Certs</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
            <CardDescription>Toggle real-time status and mobilization notice.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button>Set Available</Button>
            <Button variant="outline">Set Deployed</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI CV and Profile Builder</CardTitle>
            <CardDescription>Generate polished profile language for diving markets.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button>Generate CV Draft</Button>
            <Button variant="outline">Optimize Headline</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Private Diver Forum</CardTitle>
            <CardDescription>Verified divers only. Jobs, safety, equipment, technical discussion.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary">Open Forum</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
