import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings
import logging
import html
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def _format_datetime_human(raw: Optional[str], fallback: str = "Not available") -> str:
        if not raw:
            return fallback
        try:
            value = str(raw).strip()
            if not value:
                return fallback
            if value.endswith("Z"):
                value = value[:-1] + "+00:00"
            dt = datetime.fromisoformat(value)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            local_dt = dt.astimezone()
            return local_dt.strftime("%b %d, %Y, %I:%M:%S %p")
        except Exception:
            return fallback

    @staticmethod
    def _resolve_sender() -> tuple[str, str]:
        smtp_user = (settings.smtp_user or "").strip()
        smtp_password = (settings.smtp_password or "").replace(" ", "").strip()
        smtp_host = (settings.smtp_host or "").strip().lower()
        configured_from = (settings.smtp_from_email or "").strip()

        if not smtp_user or not smtp_password:
            raise ValueError("SMTP_USER or SMTP_PASSWORD is missing.")

        # Gmail SMTP typically rejects spoofed From domains. Use the authenticated
        # mailbox as sender unless from-email is explicitly aligned.
        if "gmail.com" in smtp_host and configured_from.lower() != smtp_user.lower():
            sender_email = smtp_user
        else:
            sender_email = configured_from or smtp_user

        return sender_email, smtp_password

    @staticmethod
    def _deliver_message(msg: MIMEMultipart, smtp_password: str) -> None:
        smtp_host = settings.smtp_host
        smtp_port = settings.smtp_port
        timeout = settings.smtp_timeout_seconds

        def send_with_starttls(host: str, port: int) -> None:
            with smtplib.SMTP(host, port, timeout=timeout) as server:
                server.starttls()
                server.login(settings.smtp_user, smtp_password)
                server.send_message(msg)

        def send_with_ssl(host: str, port: int) -> None:
            with smtplib.SMTP_SSL(host, port, timeout=timeout) as server:
                server.login(settings.smtp_user, smtp_password)
                server.send_message(msg)

        if settings.smtp_use_ssl or smtp_port == 465:
            send_with_ssl(smtp_host, smtp_port)
            return

        try:
            send_with_starttls(smtp_host, smtp_port)
        except OSError as exc:
            message = str(exc).lower()
            blocked = "forbidden by its access permissions" in message or "10013" in message
            if blocked:
                logger.warning(
                    "SMTP STARTTLS failed with socket permission error on port %s. Retrying with SSL on 465.",
                    smtp_port,
                )
                send_with_ssl(smtp_host, 465)
                return
            raise

    @staticmethod
    def send_otp_email(
        receiver_email: str,
        otp: str,
        user_name: str = "User",
        purpose: str = "verification",
    ):
        """Sends an OTP email with UnivGPT branding for signup/reset flows."""
        sender_email, smtp_password = EmailService._resolve_sender()
        if purpose == "password_reset":
            subject = f"Your UnivGPT Password Reset Code: {otp}"
            intro = (
                "We received a request to reset your UnivGPT password. "
                "Use the code below to continue."
            )
        else:
            subject = f"Your UnivGPT Verification Code: {otp}"
            intro = (
                "Welcome to UnivGPT! To complete your registration, please use "
                "the verification code below."
            )

        text_content = (
            f"Hello {user_name},\n\n"
            f"{intro}\n\n"
            f"Code: {otp}\n\n"
            "This code expires in 10 minutes. If you didn't request this, ignore this email.\n\n"
            "Regards,\nUnivGPT Team"
        )

        # Professional HTML Template
        html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0; }}
                    .container {{ max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eeeeee; }}
                    .header {{ background: #000000; padding: 30px; text-align: center; }}
                    .logo-text {{ color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }}
                    .logo-accent {{ color: #f97316; }}
                    .content {{ padding: 40px; color: #333333; line-height: 1.6; }}
                    .greeting {{ font-size: 18px; font-weight: 600; margin-bottom: 20px; }}
                    .otp-box {{ background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0; border: 1px dashed #d1d5db; }}
                    .otp-code {{ font-size: 32px; font-weight: 800; color: #f97316; letter-spacing: 5px; }}
                    .footer {{ background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #eeeeee; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header" style="text-align: center; background: #000000; padding: 40px 20px;">
                        <div style="display: inline-block; vertical-align: middle; margin-right: 15px;">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="4" r="2" fill="white" />
                                <circle cx="12" cy="20" r="2" fill="white" />
                                <circle cx="4" cy="8" r="2" fill="white" />
                                <circle cx="4" cy="16" r="2" fill="white" />
                                <circle cx="20" cy="8" r="2" fill="white" />
                                <circle cx="20" cy="16" r="2" fill="white" />
                                <circle cx="12" cy="12" r="2.5" fill="white" />
                                <line x1="12" y1="4" x2="4" y2="8" />
                                <line x1="12" y1="4" x2="20" y2="8" />
                                <line x1="4" y1="8" x2="4" y2="16" />
                                <line x1="20" y1="8" x2="20" y2="16" />
                                <line x1="4" y1="16" x2="12" y2="20" />
                                <line x1="20" y1="16" x2="12" y2="20" />
                                <line x1="4" y1="8" x2="12" y2="12" />
                                <line x1="20" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="20" x2="12" y2="12" />
                            </svg>
                        </div>
                        <div class="logo-text" style="display: inline-block; vertical-align: middle; font-size: 32px; font-weight: 800; letter-spacing: -1px; color: white;">Univ<span style="color: #f97316;">GPT</span></div>
                    </div>
                    <div class="content">
                        <div class="greeting">Hello {user_name},</div>
                        <p>{intro} This code will expire in 10 minutes.</p>
                        <div class="otp-box">
                            <div class="otp-code">{otp}</div>
                        </div>
                        <p>If you didn't request this code, you can safely ignore this email.</p>
                        <p>Best regards,<br>The UnivGPT Team</p>
                    </div>
                    <div class="footer">
                        &copy; 2026 UnivGPT. All rights reserved.<br>
                        Professional Academic AI Assistant
                    </div>
                </div>
            </body>
            </html>
            """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.smtp_from_name} <{sender_email}>"
        msg["To"] = receiver_email
        msg["Reply-To"] = sender_email

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        # SMTP Server Configuration
        EmailService._deliver_message(msg, smtp_password)

        logger.info("OTP email sent successfully to %s for %s", receiver_email, purpose)
        return True

    @staticmethod
    def send_flagged_alert_email(
        student_id: str,
        student_role: str,
        user_query: str,
        user_name: str = "Unknown",
        user_email: str = "Unknown",
        offensive_history: list[str] | None = None,
        violation_count: int | None = None,
    ):
        """Sends an alert to the admin about flagged/inappropriate student behavior."""
        try:
            sender_email, smtp_password = EmailService._resolve_sender()
            delivery_email = settings.smtp_user

            subject = "ACTION REQUIRED: Flagged User Behavior in UnivGPT"
            history = [str(item).strip() for item in (offensive_history or []) if str(item).strip()]
            if not history:
                history = [str(user_query or "").strip()]
            escaped_lines = [f"{idx + 1}. {html.escape(line)}" for idx, line in enumerate(history)]
            history_html = "<br>".join(escaped_lines)
            count_text = str(violation_count) if violation_count is not None else "Unknown"

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #f9f9f9; padding: 20px; }}
                    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #ffcccc; overflow: hidden; box-shadow: 0 4px 12px rgba(255,0,0,0.1); }}
                    .header {{ background: #dc2626; padding: 20px; color: white; text-align: center; font-size: 20px; font-weight: bold; letter-spacing: 0.5px; }}
                    .content {{ padding: 30px; color: #333; line-height: 1.6; }}
                    .details-box {{ background: #fef2f2; padding: 15px; border-left: 4px solid #dc2626; margin: 20px 0; font-family: monospace; white-space: pre-wrap; }}
                    .label {{ font-weight: 600; color: #555; width: 100px; display: inline-block; }}
                    .footer {{ background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #eee; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">Safety Alert: Policy Violation</div>
                    <div class="content">
                        <p><strong>Admin Alert:</strong></p>
                        <p>The UnivGPT moderation system has flagged a message for violating professional conduct policies.</p>
                        
                        <p><strong>Incident Details:</strong></p>
                        <div style="background: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                            <div style="margin-bottom: 8px;"><span class="label">Name:</span> {user_name}</div>
                            <div style="margin-bottom: 8px;"><span class="label">Email:</span> {user_email}</div>
                            <div style="margin-bottom: 8px;"><span class="label">User ID:</span> {student_id}</div>
                            <div style="margin-bottom: 8px;"><span class="label">Role:</span> {student_role}</div>
                            <div><span class="label">Violations:</span> {count_text}</div>
                        </div>
                        
                        <p><strong>Flagged Message History:</strong></p>
                        <div class="details-box">{history_html}</div>
                        
                        <p>Please review and take appropriate disciplinary action.</p>
                    </div>
                    <div class="footer">Automated Moderation System • UnivGPT</div>
                </div>
            </body>
            </html>
            """

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{settings.smtp_from_name} <{sender_email}>"
            msg["To"] = delivery_email

            msg.attach(MIMEText(html_content, "html"))

            EmailService._deliver_message(msg, smtp_password)

            logger.info(f"Flagged alert email successfully sent for user {student_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send flag alert email: {e}")
            return False

    @staticmethod
    def send_appeal_status_email(
        receiver_email: str,
        user_name: str = "User",
        approved: bool = True,
        decision_note: Optional[str] = None,
    ) -> bool:
        """Sends moderation appeal status email to the affected user."""
        try:
            sender_email, smtp_password = EmailService._resolve_sender()
            safe_name = html.escape(user_name or "User")
            safe_note = html.escape((decision_note or "").strip())

            if approved:
                subject = "UnivGPT Appeal Update: Approved"
                status_title = "Your appeal has been approved"
                status_body = (
                    "Your account moderation appeal has been reviewed and approved. "
                    "Your chat access has been restored."
                )
                policy_note = (
                    "Please maintain respectful conduct in future conversations. "
                    "Repeated violations may lead to disciplinary action, including fines or temporary account restrictions."
                )
            else:
                subject = "UnivGPT Appeal Update: Rejected"
                status_title = "Your appeal has been rejected"
                status_body = (
                    "Your moderation appeal was reviewed and rejected. "
                    "Your account remains blocked for chat access."
                )
                policy_note = (
                    "If you believe this decision was incorrect, contact university administration with additional context."
                )

            note_block_text = f"\nReviewer note: {safe_note}" if safe_note else ""
            note_block_html = (
                f"<p style='margin-top: 12px; color: #d1d5db;'><strong>Reviewer note:</strong> {safe_note}</p>"
                if safe_note
                else ""
            )

            text_content = (
                f"Hello {user_name},\n\n"
                f"{status_title}.\n"
                f"{status_body}\n\n"
                f"{policy_note}"
                f"{note_block_text}\n\n"
                "Regards,\nUnivGPT Administration"
            )

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #0b0b0c; margin: 0; padding: 0; }}
                    .container {{ max-width: 620px; margin: 24px auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; }}
                    .header {{ background: #111111; color: #ffffff; padding: 22px 24px; font-size: 24px; font-weight: 800; }}
                    .header .accent {{ color: #f97316; }}
                    .content {{ padding: 24px; color: #e5e7eb; line-height: 1.6; }}
                    .status {{ margin: 14px 0; padding: 12px 14px; border-radius: 10px; background: #0f172a; border: 1px solid #374151; }}
                    .footer {{ padding: 14px 24px; color: #9ca3af; font-size: 12px; border-top: 1px solid #1f2937; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">Univ<span class="accent">GPT</span></div>
                    <div class="content">
                        <p>Hello {safe_name},</p>
                        <div class="status"><strong>{html.escape(status_title)}</strong></div>
                        <p>{html.escape(status_body)}</p>
                        <p>{html.escape(policy_note)}</p>
                        {note_block_html}
                    </div>
                    <div class="footer">This is an automated account-status update from UnivGPT.</div>
                </div>
            </body>
            </html>
            """

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{settings.smtp_from_name} <{sender_email}>"
            msg["To"] = receiver_email
            msg["Reply-To"] = sender_email

            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            EmailService._deliver_message(msg, smtp_password)
            logger.info("Appeal status email sent to %s (approved=%s)", receiver_email, approved)
            return True
        except Exception as e:
            logger.error("Failed to send appeal status email to %s: %s", receiver_email, e)
            return False

    @staticmethod
    def send_user_activity_notice_email(
        receiver_email: str,
        user_name: str,
        subject: str,
        admin_message: str,
        user_query_count: int,
        active_days_30: int,
        account_age_days: int,
        last_query_at: str | None,
        generated_by: str,
        generated_at: str | None = None,
    ) -> bool:
        """Send admin broadcast notice with recipient-isolated stats."""
        try:
            sender_email, smtp_password = EmailService._resolve_sender()
            safe_name = html.escape(user_name or "User")
            safe_message = html.escape((admin_message or "").strip() or "Please review this platform activity update.")
            safe_generated_by = html.escape(generated_by or "Admin")
            generated_iso = generated_at or datetime.now(timezone.utc).isoformat()
            generated_label = EmailService._format_datetime_human(generated_iso, fallback="Now")
            last_query_label = EmailService._format_datetime_human(last_query_at, fallback="No query history yet")

            text_content = (
                f"Hello {user_name},\n\n"
                "You have a new activity notice from UnivGPT administration.\n\n"
                f"Message: {admin_message}\n\n"
                f"Your query count: {user_query_count}\n"
                f"Active days (last 30): {active_days_30}\n"
                f"Account age (days): {account_age_days}\n"
                f"Last query at: {last_query_label}\n"
                f"Generated by: {generated_by}\n"
                f"Generated at: {generated_label}\n\n"
                "Regards,\nUnivGPT Administration"
            )

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #0b0b0c; margin: 0; padding: 0; }}
                    .container {{ max-width: 640px; margin: 24px auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; }}
                    .header {{ background: #0f172a; color: #ffffff; padding: 22px 24px; font-size: 24px; font-weight: 800; }}
                    .accent {{ color: #f97316; }}
                    .content {{ padding: 24px; color: #e5e7eb; line-height: 1.6; }}
                    .message {{ background: linear-gradient(135deg, #0b1220, #131e33); border: 1px solid #334155; border-radius: 10px; padding: 14px; margin: 14px 0 18px; }}
                    .stats {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 10px; }}
                    .stat {{ background: #0b1220; border: 1px solid #334155; border-radius: 10px; padding: 12px 14px; box-sizing: border-box; min-height: 84px; }}
                    .label {{ color: #94a3b8; font-size: 12px; line-height: 1.25; margin-bottom: 6px; }}
                    .value {{ color: #f8fafc; font-size: 18px; font-weight: 700; line-height: 1.25; margin-top: 0; }}
                    .value-sm {{ color: #f8fafc; font-size: 13px; font-weight: 600; line-height: 1.4; margin-top: 0; word-break: break-word; }}
                    .footer {{ padding: 14px 24px; color: #94a3b8; font-size: 12px; border-top: 1px solid #1f2937; }}
                    @media (max-width: 560px) {{
                        .stats {{ grid-template-columns: 1fr; }}
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">Univ<span class="accent">GPT</span></div>
                    <div class="content">
                        <p>Hello {safe_name},</p>
                        <p>You have a new activity notice from UnivGPT administration.</p>
                        <div class="message">{safe_message}</div>

                        <div class="stats">
                            <div class="stat">
                                <div class="label">Your Queries</div>
                                <div class="value">{int(user_query_count)}</div>
                            </div>
                            <div class="stat">
                                <div class="label">Active Days (Last 30)</div>
                                <div class="value">{int(active_days_30)}</div>
                            </div>
                            <div class="stat">
                                <div class="label">Account Age</div>
                                <div class="value-sm">{int(account_age_days)} days</div>
                            </div>
                            <div class="stat">
                                <div class="label">Last Query</div>
                                <div class="value-sm">{html.escape(last_query_label)}</div>
                            </div>
                        </div>
                    </div>
                    <div class="footer">
                        Generated by {safe_generated_by} at {html.escape(generated_label)}.
                    </div>
                </div>
            </body>
            </html>
            """

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject or "UnivGPT User Activity Notice"
            msg["From"] = f"{settings.smtp_from_name} <{sender_email}>"
            msg["To"] = receiver_email
            msg["Reply-To"] = sender_email

            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            EmailService._deliver_message(msg, smtp_password)
            logger.info("User activity notice email sent to %s", receiver_email)
            return True
        except Exception as exc:
            logger.error("Failed to send user activity notice email to %s: %s", receiver_email, exc)
            return False
