import { divers } from "@/lib/mock-data";

function metricLabel(value: number) {
  return value > 0 ? value.toLocaleString() : "Not declared";
}

export default function GarethMiddletonCvPage() {
  const diver = divers.find((entry) => entry.username === "gareth");

  if (!diver) {
    return <div className="mx-auto max-w-4xl px-4 py-10">Profile not found.</div>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 text-sm leading-relaxed print:max-w-none print:px-0 print:py-0">
      <header className="space-y-2 border-b pb-4">
        <h1 className="text-3xl font-bold">{diver.fullName}</h1>
        <p>{diver.location} | +46 70 510 50 08 | garethmiddleton@gmail.com | LinkedIn: Available on request</p>
        <p className="font-semibold">{diver.headline}</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Professional Summary</h2>
        <p>{diver.bio}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Core Competencies</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Air Diving Offshore/Onshore Construction</li>
          <li>Saturation Support Operations</li>
          <li>Diver Medic Technician (DMT)</li>
          <li>Assistant Dive Supervision</li>
          <li>Underwater Welding and Broco Cutting</li>
          <li>IRM, Subsea Installation, and Pipeline Works</li>
          <li>NDT/Inspection Support (Cygnus UT)</li>
          <li>IMCA / OEUK / OPITO Safety Compliance</li>
        </ul>
      </section>

      <section className="space-y-1">
        <h2 className="text-xl font-semibold">Career Metrics</h2>
        <p>Years of Experience: 20+</p>
        <p>Total Saturation Hours: {metricLabel(diver.satHours)}</p>
        <p>Total Dive Hours: {metricLabel(diver.diveHours)}</p>
        <p>Availability: {diver.mobilizationNotice}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Recent Professional Experience</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>SWESUB AB, Sweden (2024-Present) - Construction Diver on multiple underwater construction projects.</li>
          <li>Hibiscus EP, Brunei (Jun 2025-Present) - Air Diver / DMT / Sat Support for MLJ1-MLJ2 subsea clamp installation.</li>
          <li>DON, Bangladesh (Feb 2025-Mar 2025) - Air Diver on IRM scope for Excelerate Energy FSRU (Beacon).</li>
          <li>Summit Bangladesh, Bangladesh (Sep 2024-Nov 2024) - Air Diver / DMT for FSRU hawser repatriation works.</li>
          <li>MOPU Southern Star (Aug 2024) - Assistant Dive Supervisor / Air Diver for remedial offshore scope.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Education</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>International Accredited Offshore and Onshore Commercial Diving Qualifications (2011)</li>
          <li>BSc Sport Science, UCLA, USA (2007-2009)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Certifications and Courses</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>IMCA Trainee Air Diving Supervisor (TADS-043-03) - Issued: 26/07/2024 - Expires: 26/07/2027</li>
          <li>Diver Medic Technician (DMT-122-09) - Issued: 19/10/2024 - Expires: 19/10/2026</li>
          <li>OPITO BOSIET with HUET and CA-EBS - Issued: 04/01/2023 - Expires: 05/01/2027</li>
          <li>OEUK Medical Certificate - Issued: 28/03/2025 - Expires: 27/03/2027</li>
          <li>HSE Diver Medical (MA1/MA2) - Issued: 28/03/2025 - Expires: 28/03/2026</li>
          <li>IDSA Level 3 Surface Supplied Offshore Air Diver (IDSA 2224) - Issued: 16/03/2011 - Expires: N/A</li>
        </ul>
        <p className="font-semibold">Action required: Update HSE Diver Medical if current date is beyond 28/03/2026.</p>
      </section>

      <section className="space-y-2 pb-6">
        <h2 className="text-xl font-semibold">References</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Jesper Skouv, Nordic Sub, +45 41 42 09 01</li>
          <li>Micke Valander, HBM Construction, +46 705 31 23 01</li>
          <li>Jonas Lassen, Lassen Construction, +46 708 88 94 16</li>
        </ul>
      </section>
    </main>
  );
}
