'use client'

import { useState, useRef, useEffect, useCallback, FC } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  setHours,
  setMinutes,
  getHours,
  getMinutes,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DateTimePickerProps {
  value: string // ISO-like string  "2026-02-17T14:30"
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/**
 * Dark-themed DateTime picker matching the EcoFlow dashboard design system.
 * Replaces the native <input type="datetime-local"> with a fully styled calendar
 * and time selector.
 */
export const DateTimePicker: FC<DateTimePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select date & time',
  className,
}) => {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      const d = new Date(value)
      return isNaN(d.getTime()) ? new Date() : d
    }
    return new Date()
  })
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    if (value) {
      const d = new Date(value)
      return isNaN(d.getTime()) ? null : d
    }
    return null
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Sync external value changes
  useEffect(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        setSelectedDate(d)
        setViewDate(d)
      }
    } else {
      setSelectedDate(null)
    }
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const emitChange = useCallback(
    (date: Date) => {
      // Emit in datetime-local compatible format: "YYYY-MM-DDTHH:mm"
      const y = date.getFullYear()
      const mo = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const h = String(getHours(date)).padStart(2, '0')
      const mi = String(getMinutes(date)).padStart(2, '0')
      onChange(`${y}-${mo}-${d}T${h}:${mi}`)
    },
    [onChange]
  )

  const handleDayClick = (day: Date) => {
    // Preserve existing time if a date was already selected
    let newDate = day
    if (selectedDate) {
      newDate = setHours(setMinutes(day, getMinutes(selectedDate)), getHours(selectedDate))
    }
    setSelectedDate(newDate)
    emitChange(newDate)
  }

  const handleHourChange = (hour: number) => {
    const base = selectedDate || new Date()
    const newDate = setHours(base, hour)
    setSelectedDate(newDate)
    emitChange(newDate)
  }

  const handleMinuteChange = (minute: number) => {
    const base = selectedDate || new Date()
    const newDate = setMinutes(base, minute)
    setSelectedDate(newDate)
    emitChange(newDate)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDate(null)
    onChange('')
  }

  const handleToday = () => {
    const now = new Date()
    setViewDate(now)
    setSelectedDate(now)
    emitChange(now)
  }

  // --- Build calendar grid ---
  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const gridStart = startOfWeek(monthStart) // Sunday
  const gridEnd = endOfWeek(monthEnd)

  const days: Date[] = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5) // 5-minute increments

  const currentHour = selectedDate ? getHours(selectedDate) : getHours(new Date())
  const currentMinute = selectedDate ? getMinutes(selectedDate) : getMinutes(new Date())
  // Round minute to nearest 5 for highlight
  const nearestMinute = Math.round(currentMinute / 5) * 5

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger input */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2 bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2',
          'text-left transition-all duration-160 ease-dashboard',
          'hover:border-stroke-strong focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40',
          open && 'border-brand-primary ring-1 ring-brand-primary/40'
        )}
      >
        <Calendar className="w-4 h-4 text-text-muted shrink-0" />
        <span className={cn('flex-1 text-sm', selectedDate ? 'text-text-primary' : 'text-text-muted')}>
          {selectedDate ? format(selectedDate, 'MMM d, yyyy  HH:mm') : placeholder}
        </span>
        {selectedDate && (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleClear}
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            'absolute z-50 mt-2 left-0',
            'bg-surface-1 border border-stroke-subtle rounded-card shadow-card',
            'p-4 w-[340px]',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}
        >
          {/* Calendar header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-text-primary">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day-of-week labels */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-text-muted py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day, idx) => {
              const inMonth = isSameMonth(day, viewDate)
              const selected = selectedDate ? isSameDay(day, selectedDate) : false
              const today = isToday(day)

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    'h-8 w-full rounded-lg text-xs font-medium transition-all duration-100',
                    !inMonth && 'text-text-muted/40',
                    inMonth && !selected && 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                    today && !selected && 'text-brand-primary font-semibold',
                    selected && 'bg-brand-primary text-bg-base font-semibold'
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-stroke-subtle my-3" />

          {/* Time selector */}
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-text-muted mt-1 shrink-0" />
            <div className="flex-1">
              <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-2">
                Time
              </div>
              <div className="flex items-center gap-2">
                {/* Hours */}
                <div className="relative flex-1">
                  <select
                    value={currentHour}
                    onChange={(e) => handleHourChange(Number(e.target.value))}
                    className={cn(
                      'w-full bg-surface-2 border border-stroke-subtle rounded-lg px-2 py-1.5',
                      'text-text-primary text-sm text-center appearance-none',
                      'focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40',
                      'cursor-pointer'
                    )}
                  >
                    {hours.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted">
                    Hr
                  </span>
                </div>

                <span className="text-text-muted text-lg font-light">:</span>

                {/* Minutes */}
                <div className="relative flex-1">
                  <select
                    value={nearestMinute >= 60 ? 55 : nearestMinute}
                    onChange={(e) => handleMinuteChange(Number(e.target.value))}
                    className={cn(
                      'w-full bg-surface-2 border border-stroke-subtle rounded-lg px-2 py-1.5',
                      'text-text-primary text-sm text-center appearance-none',
                      'focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40',
                      'cursor-pointer'
                    )}
                  >
                    {minutes.map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted">
                    Min
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-stroke-subtle">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleToday}
                className="text-xs text-brand-primary hover:text-brand-secondary transition-colors font-medium"
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={cn(
                  'px-3 py-1 rounded-pill text-xs font-medium',
                  'bg-brand-primary text-bg-base',
                  'hover:brightness-110 transition-all duration-160 ease-dashboard'
                )}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DateTimePicker
