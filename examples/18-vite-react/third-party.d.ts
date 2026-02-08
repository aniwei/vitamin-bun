declare module '@monaco-editor/react'

declare module 'react-arborist' {
  import type { CSSProperties, ReactNode } from 'react'

  export type NodeApi<T> = {
    data: T
    isLeaf: boolean
    isOpen: boolean
    isSelected: boolean
  }

  export type TreeProps<T> = {
    data: T[]
    width?: number | string
    height?: number | string
    rowHeight?: number
    indent?: number
    selection?: 'single' | 'multi'
    initialOpenState?: Record<string, boolean>
    onSelect?: (nodes: NodeApi<T>[]) => void
    children: (args: { node: NodeApi<T>; style: CSSProperties }) => ReactNode
  }

  export function Tree<T>(props: TreeProps<T>): JSX.Element
}
