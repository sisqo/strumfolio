'use client'

import { ExportPanel } from '@/components/ExportPanel'
import { useRole } from '@/components/RoleProvider'

/**
 * Hidden until a role arrives that can use it — same "hide until known" reasoning as
 * everything else `useRole` gates (see its own doc comment): the export actions behind
 * this page already refuse anyone without edit rights, so there is nothing to show a
 * viewer here, and nothing to show anyone before the role is known either.
 */
export function ExportScreen() {
  const { known, mayEdit } = useRole()
  if (!known || !mayEdit) return null

  return (
    <>
      <header className="mb-[1.125rem]">
        <h1 className="screen-title">Export</h1>
        {/* No longer «for reading or printing outside the app»: printing is the booklet's job
            and the booklet has its own screen now, one entry up in the same menu. Naming it
            here would send a reader looking for a card that is not on this page any more. */}
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          Download your repertoire as a zip — a plain backup to restore later, or a copy
          organized into folders for reading outside the app.
        </p>
      </header>

      <ExportPanel />
    </>
  )
}
