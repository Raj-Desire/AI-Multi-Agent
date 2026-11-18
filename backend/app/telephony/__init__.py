"""Telephony provider adapters. Importing this package registers the available providers."""

from app.telephony.registry import register_provider
from app.telephony.plivo_provider import PlivoProvider
from app.telephony.twilio_provider import TwilioProvider

register_provider(TwilioProvider())
register_provider(PlivoProvider())
