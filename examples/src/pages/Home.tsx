import React from 'react'
import { Link } from 'react-router-dom'
import { examples } from '../routes'

export function Home() {
  return (
    <div className="page">
      <div className="example-tag">Examples</div>
      <div className="example-header">
        <div>
          <h1>Vitamin Bun Examples</h1>
          <p>All examples are now hosted in a single React app with shared styling.</p>
        </div>
      </div>
      <div className="card-grid">
        {examples.map((example) => (
          <Link key={example.path} className="card" to={example.path}>
            <div className="card-title">{example.label}</div>
            <div className="card-desc">{example.description}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
