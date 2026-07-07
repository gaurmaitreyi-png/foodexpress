"""Google Sign-In.

The frontend uses Google Identity Services to obtain an ID token (a JWT), then
POSTs it here. We verify it against GOOGLE_CLIENT_ID, get-or-create a local user,
and hand back our own JWT pair — so the rest of the API keeps using the same
SimpleJWT auth as username/password login.

Kept in its own module (like chat.py / payments.py) so the OAuth plumbing stays
out of the core CRUD views.
"""
from decouple import config
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model

User = get_user_model()

GOOGLE_CLIENT_ID = config("GOOGLE_CLIENT_ID", default="")


def _unique_username(email: str) -> str:
    base = (email.split("@")[0] or "user")[:140]
    username, i = base, 1
    while User.objects.filter(username=username).exists():
        username = f"{base}{i}"
        i += 1
    return username


class GoogleLoginView(APIView):
    """POST /api/auth/google/  body: { "credential": "<google id token>" }

    Returns { access, refresh, username } exactly like /auth/login/.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        credential = request.data.get("credential") or request.data.get("id_token")
        if not credential:
            return Response(
                {"detail": "Missing Google credential."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not GOOGLE_CLIENT_ID:
            return Response(
                {"detail": "Google login is not configured on the server "
                           "(set GOOGLE_CLIENT_ID)."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            # clock_skew_in_seconds tolerates small server/Google clock drift,
            # a common cause of "Token used too early/late" rejections.
            info = google_id_token.verify_oauth2_token(
                credential, google_requests.Request(), GOOGLE_CLIENT_ID,
                clock_skew_in_seconds=10,
            )
        except ValueError as e:
            # Surface the specific reason (audience mismatch, expiry, clock skew)
            # so failures are diagnosable instead of a generic message.
            return Response(
                {"detail": f"Invalid Google token: {e}"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        email = info.get("email")
        if not email:
            return Response(
                {"detail": "Google account has no email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Use filter().first() rather than get_or_create so a duplicate email
            # (which would raise MultipleObjectsReturned) can't 500 the endpoint.
            user = User.objects.filter(email=email).order_by("id").first()
            if user is None:
                user = User(username=_unique_username(email), email=email)
                user.set_unusable_password()
                user.first_name = info.get("given_name", "")[:150]
                user.last_name = info.get("family_name", "")[:150]
                user.save()

            refresh = RefreshToken.for_user(user)
        except Exception as e:  # surface the real reason instead of a bare 500
            return Response(
                {"detail": f"Login error: {type(e).__name__}: {e}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "username": user.username,
            "is_restaurant_owner": user.is_restaurant_owner,
        })
