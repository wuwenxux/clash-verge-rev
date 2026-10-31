import { Button, Stack, TextField, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'
import { frogleapConsumeTicket, frogleapSendLoginLink } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

// Provision a Cloudflare Turnstile sitekey that allows hostname `tauri.localhost`
// and set it here; leave empty to send requests without the verification header.
const TURNSTILE_SITEKEY = ''

const TICKET_PATTERN = /[?&]ticket=([^\s&]+)/

interface TurnstileWidget {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  getResponse: (id: string) => string | undefined
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget
  }
}

const extractTicket = (text: string) => TICKET_PATTERN.exec(text)?.[1] ?? ''

export const FrogLeapImport = (props: { onImported: (subUrl: string) => void }) => {
  const { onImported } = props
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const importingRef = useRef(false)

  const ticket = useMemo(() => extractTicket(link), [link])
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim())

  const reset = useCallback(() => {
    setEmail('')
    setSent(false)
    setLink('')
    widgetIdRef.current = null
    importingRef.current = false
    if (turnstileRef.current) turnstileRef.current.innerHTML = ''
  }, [])

  useEffect(() => {
    if (!open || !TURNSTILE_SITEKEY || widgetIdRef.current) return
    const render = () => {
      if (window.turnstile && turnstileRef.current && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITEKEY,
        })
      }
    }
    if (window.turnstile) {
      render()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = render
    document.head.appendChild(script)
  }, [open])

  useEffect(() => {
    if (!open || !sent || ticket) return
    const timer = setInterval(() => {
      navigator.clipboard
        .readText()
        .then((text) => {
          const found = extractTicket(text)
          if (found) setLink(text.trim())
        })
        .catch(() => undefined)
    }, 1500)
    return () => clearInterval(timer)
  }, [open, sent, ticket])

  const handleSend = async () => {
    if (!emailValid) {
      showNotice.error('profiles.page.feedback.errors.invalidEmail')
      return
    }
    const token =
      widgetIdRef.current && window.turnstile
        ? window.turnstile.getResponse(widgetIdRef.current)
        : undefined
    setLoading(true)
    try {
      const result = await frogleapSendLoginLink(email.trim(), token)
      if (result.throttled) {
        showNotice.info('profiles.page.feedback.notifications.linkThrottled')
      }
      setSent(true)
    } catch (err) {
      showNotice.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = useCallback(
    async (target: string) => {
      const found = extractTicket(target)
      if (!found) {
        showNotice.error('profiles.page.feedback.errors.invalidMagicLink')
        return
      }
      if (importingRef.current) return
      importingRef.current = true
      setLoading(true)
      try {
        const result = await frogleapConsumeTicket(found)
        setOpen(false)
        reset()
        onImported(result.sub_url)
      } catch (err) {
        showNotice.error(err)
      } finally {
        setLoading(false)
        importingRef.current = false
      }
    },
    [onImported, reset],
  )

  useEffect(() => {
    if (ticket && sent) void handleImport(link)
  }, [ticket, sent, link, handleImport])

  const handleClose = () => {
    setOpen(false)
    reset()
  }

  return (
    <>
      <Button
        variant="contained"
        size="small"
        sx={{ borderRadius: '6px' }}
        onClick={() => setOpen(true)}
      >
        {t('profiles.page.actions.frogleapImport')}
      </Button>
      <BaseDialog
        open={open}
        title={t('profiles.modals.frogleap.title')}
        contentSx={{ width: 380, pb: 1 }}
        cancelBtn={t('shared.actions.cancel')}
        onClose={handleClose}
        onCancel={handleClose}
        onOk={sent ? () => handleImport(link) : handleSend}
        okBtn={
          sent
            ? ticket
              ? t('profiles.modals.frogleap.confirm')
              : null
            : t('profiles.modals.frogleap.send')
        }
        loading={loading}
      >
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {!sent && (
            <>
              <TextField
                autoFocus
                size="small"
                fullWidth
                label={t('profiles.modals.frogleap.emailLabel')}
                placeholder={t('profiles.modals.frogleap.emailPlaceholder')}
                value={email}
                disabled={loading}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && emailValid && !loading) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
              />
              {TURNSTILE_SITEKEY && <div ref={turnstileRef} />}
            </>
          )}
          {sent && (
            <>
              <Typography variant="body2" color="text.secondary">
                {t('profiles.modals.frogleap.sentHint', { email: email.trim() })}
              </Typography>
              <TextField
                size="small"
                fullWidth
                label={t('profiles.modals.frogleap.linkLabel')}
                placeholder={t('profiles.modals.frogleap.linkPlaceholder')}
                value={link}
                disabled={loading}
                onChange={(e) => setLink(e.target.value)}
              />
            </>
          )}
        </Stack>
      </BaseDialog>
    </>
  )
}
