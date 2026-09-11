import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/top-nav";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    title: "Privacy — StickTime FPV",
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <>
      <TopNav />
      <div className="min-h-screen bg-zinc-950 text-white pt-20">
        <main className="mx-auto max-w-6xl px-6 pb-16 pt-12 lg:pt-24">
          <section className="mb-16">
            <h1 className="text-5xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-zinc-400 text-lg">
              Last Updated: September 2026
            </p>
          </section>

          <section className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-semibold mb-4">
              Introduction &amp; Scope
            </h2>
            <p className="text-zinc-300 leading-relaxed">
              This Privacy Policy explains how StickTime FPV collects, uses, and
              protects your personal information. We operate under strict data
              protection standards designed to safeguard your privacy while
              delivering our flight tracking and analytics platform.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">
              Information We Collect
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Account Information
                </h3>
                <p className="text-zinc-400">
                  We collect your account credentials, profile details, and any
                  custom settings you configure within the platform.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Drone Telemetry
                </h3>
                <p className="text-zinc-400">
                  Flight data including GPS coordinates, altitude, speed,
                  battery levels, telemetry logs, flight duration, gear usage
                  statistics, controller and goggles information, weather data,
                  and pilot notes.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Flight Logs
                </h3>
                <p className="text-zinc-400">
                  Detailed records of each flight session, including duration,
                  weather conditions, and performance metrics.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Battery Data
                </h3>
                <p className="text-zinc-400">
                  Real-time and historical battery usage statistics for all
                  registered drones.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">
              How We Use Your Data
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Core Service Delivery
                </h3>
                <p className="text-zinc-400">
                  Your data enables us to provide accurate flight tracking,
                  generate performance reports, and deliver the core
                  functionality of StickTime FPV.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Billing via Stripe
                </h3>
                <p className="text-zinc-400">
                  Subscription fees are processed securely through Stripe, with
                  all payment information encrypted and never stored in plain
                  text.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Platform Stability
                </h3>
                <p className="text-zinc-400">
                  Adequate data processing ensures reliable service uptime,
                  real-time telemetry streaming, and seamless integration with
                  third-party tools.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">
              Student &amp; Educational Data Protection
            </h2>
            <p className="text-zinc-400">
              We comply with COPPA and FERPA regulations for any educational or
              student-related data collected through our platform. Parental
              consent is required for minors, and we do not sell any personal
              data to third parties.
            </p>
            <p className="text-zinc-400 mt-4">
              School-owned accounts and team data are protected separately, with
              access restricted to authorized administrators only.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Data Security</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Encryption
                </h3>
                <p className="text-zinc-400">
                  All data in transit and at rest is securely encrypted using
                  industry-standard protocols to protect your personal
                  information and flight data.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Access Control
                </h3>
                <p className="text-zinc-400">
                  Role-based access controls restrict data visibility to
                  authorized personnel only. Multi-factor authentication is
                  required for administrative functions.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">
              User Rights &amp; Data Deletion
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Data Access
                </h3>
                <p className="text-zinc-400">
                  You can request copies of your personal data at any time
                  through our support channel.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-medium text-zinc-200 mb-2">
                  Data Deletion
                </h3>
                <p className="text-zinc-400">
                  Request permanent deletion of your account and associated data
                  by contacting support.
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-zinc-800 pt-8">
            <h2 className="text-2xl font-semibold mb-4">
              Governing Law & Oklahoma Jurisdiction
            </h2>
            <p className="text-zinc-400 text-sm mb-4">
              StickTime FPV is operated from the State of Oklahoma. These
              Privacy Policy terms and any disputes arising herefrom shall be
              governed by and construed in accordance with the laws of the State
              of Oklahoma, without regard to its conflict of law provisions.
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
