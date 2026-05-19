import { AppHeader } from '@/components/AppHeader'
import { L1RegistryCarousel } from '@/components/L1RegistryCarousel'
import { OperatorRegistryCarousel } from '@/components/OperatorRegistryCarousel'

export default function Page() {
  return (
    <>
      <AppHeader />
      <main className="min-h-screen px-6 py-8 space-y-10">
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            L1 Networks
          </h2>
          <L1RegistryCarousel />
        </section>
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Operators
          </h2>
          <OperatorRegistryCarousel />
        </section>
      </main>
    </>
  )
}
