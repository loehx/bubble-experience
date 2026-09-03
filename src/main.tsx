import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SlashSounds } from './soundboard/SlashSounds'
import { Soundboard } from './soundboard/Soundboard'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Routes>
        <Route path="/slash-sounds" element={<SlashSounds />} />
        <Route path="*" element={<Soundboard />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
