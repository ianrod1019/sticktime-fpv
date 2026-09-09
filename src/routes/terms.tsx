import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/top-nav";

export const Route = createFileRoute("/terms")({
  head: () => ({
    title: "Terms of Service — StickTime FPV"
  }),
  component: Terms,
});

function Terms() {
  return (
    <>
      <TopNav />
      <div className="min-h-screen bg-zinc-950 text-white pt-20">
        <main className="mx-auto max-w-4xl px-6 pb-16 pt-12 lg:pt-24">
          <section className="mb-16">
            <h1 className="text-5xl font-bold mb-4">Terms of Service</h1>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-zinc-300 leading-relaxed">
              By accessing, downloading, or using StickTime FPV ("Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to all of these terms and conditions, you are strictly prohibited from using or accessing our platform.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">2. Account Registration and Security</h2>
            <p className="text-zinc-300 leading-relaxed">
              You must provide accurate, current, and complete information during registration and keep your account details updated. You are entirely responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">3. Nature of Service and Flight Safety Warning</h2>
            <p className="text-zinc-300 leading-relaxed">
              StickTime FPV is a digital flight tracking, analytics, and simulation platform designed for FPV (First Person View) drone enthusiasts.
            </p>
            <ul className="list-disc list-inside text-zinc-300 leading-relaxed mt-4 space-y-2">
              <li>
                <strong>No Control Over Real-World Operations:</strong> We do not manufacture, sell, inspect, maintain, or control any physical drones, hardware, or equipment used by you. We do not provide flight instruction, regulatory compliance advice, repair services, or medical advice.
              </li>
              <li>
                <strong>Assumption of Risk:</strong> FPV drone flying and racing involve inherent risks, including property damage, severe bodily injury, or death. You expressly assume all risks associated with operating drones while using or referencing our platform, data, or analytics.
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">4. User Content and Data License</h2>
            <p className="text-zinc-300 leading-relaxed">
              You retain ownership of all flight data, text, graphics, and content you submit or upload ("User Content"). By uploading User Content, you grant StickTime FPV a worldwide, non-exclusive, royalty-free, transferable license to store, process, analyze, and display your data solely to provide and improve the platform's functionality.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">5. Prohibited Activities</h2>
            <p className="text-zinc-300 leading-relaxed">
              You agree that you will not, under any circumstances:
            </p>
            <ol className="list-decimal list-inside text-zinc-300 leading-relaxed mt-4 space-y-2">
              <li>
                <strong>Violate laws:</strong> Violate any local, state, national, or international laws, regulations, or FAA (or equivalent aviation authority) rules regarding drone flight;
              </li>
              <li>
                <strong>Upload malicious content:</strong> Upload malicious code, viruses, or disruptive software;
              </li>
              <li>
                <strong>Interfere with security:</strong> Interfere with, disable, or compromise the security or integrity of the platform;
              </li>
              <li>
                <strong>Reverse engineer:</strong> Reverse engineer, decompile, or extract the source code of our software or simulators;
              </li>
              <li>
                <strong>Fraudulent use:</strong> Use the service for any fraudulent, harmful, or unlawful commercial purpose; or
              </li>
              <li>
                <strong>Dangerous operation:</strong> Use platform data to pilot drones recklessly, dangerously, or over non-consenting crowds/property.
              </li>
            </ol>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">6. Disclaimers ("AS IS" and "AS AVAILABLE")</h2>
            <p className="text-zinc-300 leading-relaxed">
              YOUR USE OF THE PLATFORM IS AT YOUR SOLE RISK. THE PLATFORM AND ALL ASSOCIATED ANALYTICS, SOFTWARE, AND SERVICES ARE PROVIDED ON an "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, STICKTIME FPV DISCLAIMS ALL WARRANTIES, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, ERROR-FREE, OR FREE OF VIRUSES, OR THAT FLIGHT DATA OR ANALYTICS WILL BE ACCURATE OR RELIABLE.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">7. Limitation of Liability</h2>
            <p className="text-zinc-300 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL STICKTIME FPV, ITS FOUNDERS, OFFICERS, EMPLOYEES, AGENTS, OR SUPPLIERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, DATA, USE, GOODWILL, DRONE LOSS, PROPERTY DAMAGE, OR PERSONAL INJURY, ARISING OUT OF OR IN CONNECTION WITH YOUR ACCESS TO OR USE OF (OR INABILITY TO ACCESS OR USE) THE PLATFORM, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE, OR ANY OTHER LEGAL THEORY, WHETHER OR NOT STICKTIME FPV HAS BEEN INFORMED OF THE POSSIBILITY OF SUCH DAMAGE.
            </p>
            <p className="text-zinc-300 leading-relaxed mt-4">
              IN NO EVENT SHALL STICKTIME FPV'S TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNT ACTUALLY PAID BY YOU TO STICKTIME FPV (IF ANY) IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED US DOLLARS ($100), WHICHEVER IS GREATER.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">8. Indemnification</h2>
            <p className="text-zinc-300 leading-relaxed">
              You agree to defend, indemnify, and hold harmless StickTime FPV, its affiliates, licensors, and service providers, and its and their respective officers, directors, employees, contractors, agents, licensors, suppliers, successors, and assigns from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to: (a) your violation of these Terms; (b) your use of the platform; (c) your violation of any third-party right, including any intellectual property, privacy, or aviation/property law; or (d) any physical damage, injury, or death caused by your drone operations, whether informed by our analytics or not.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">9. Class Action and Jury Trial Waiver</h2>
            <p className="text-zinc-300 leading-relaxed">
              You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action. YOU AND STICKTIME FPV WAIVE ANY RIGHT TO A JURY TRIAL OR TO PARTICIPATE IN A CLASS ACTION LAWSUIT.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">10. Governing Law and Jurisdiction</h2>
            <p className="text-zinc-300 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the State of Oklahoma, United States, without regard to its conflict of law principles. Any legal action, suit, or proceeding arising out of or relating to these Terms or the Platform shall be instituted exclusively in the state or federal courts located in Oklahoma, and you submit to the personal jurisdiction of such courts.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">11. Changes to Terms</h2>
            <p className="text-zinc-300 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will provide notice of material changes by updating the "Last Updated" date at the top of this policy. Your continued use of the platform after changes become effective constitutes your binding acceptance of the updated terms.
            </p>
          </section>

          <section className="border-t border-zinc-800 pt-8">
            <p className="text-zinc-400 text-sm">
              Last Updated: September 2026
            </p>
          </section>
        </main>
      </div>
    </>
  );
}