import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10">
      <h1 className="text-3xl font-bold">Admin Console</h1>
      <Card>
        <CardHeader>
          <CardTitle>Verification Queue</CardTitle>
        </CardHeader>
        <CardContent>Review diver cert uploads and issue verified badge.</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Forum Moderation</CardTitle>
        </CardHeader>
        <CardContent>Manage reports, category rules, and moderator actions.</CardContent>
      </Card>
    </div>
  );
}
