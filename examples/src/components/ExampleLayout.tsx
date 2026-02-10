import React from 'react'
import { Link } from 'react-router-dom'

type ExampleLayoutProps = {
  tag: string
  title: string
  description: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function ExampleLayout({ tag, title, description, actions, children }: ExampleLayoutProps) {
  return (
    <div className="page">
      <div className="example-tag">{tag}</div>
      <div className="example-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="example-actions">{actions}</div> : null}
      </div>
      <div className="panel">{children}</div>
      <div style={{ marginTop: 16 }}>
        <Link to="/">Back to home</Link>
      </div>
    </div>
  )
}
