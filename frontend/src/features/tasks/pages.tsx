import { PageHeader } from '@/components/page-header'

// Pantallas provisionales: su contenido llega en la Fase 4.

function ComingSoon() {
  return <p className="text-sm text-muted-foreground">Próximamente.</p>
}

export function BoardPage() {
  return (
    <>
      <PageHeader title="Tablero" description="Tus tareas por estado." />
      <ComingSoon />
    </>
  )
}

export function ListPage() {
  return (
    <>
      <PageHeader title="Lista" description="Filtra, busca y ordena tus tareas." />
      <ComingSoon />
    </>
  )
}

export function StatusesPage() {
  return (
    <>
      <PageHeader title="Estados" description="Las columnas de tu tablero." />
      <ComingSoon />
    </>
  )
}
