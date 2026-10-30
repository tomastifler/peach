"""JAV 用户脚本的专用权限端点与本机配对设置。"""
import json

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response

from .config import PROJECT_ROOT
from .jav_browser import identify_source
from .routes_auth import require_auth


def browser_client(request: Request):
    service = request.app.state.jav_browser
    authorization = request.headers.get("authorization", "")
    token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
    if not service.authorized(token):
        raise HTTPException(401, "Enable browser add in the Peach download channel and configure a dedicated token")
    if not service.downloads.available:
        raise HTTPException(403, "Browser add is only available on devices allowed to modify the database")
    return service


def userscript():
    script = (PROJECT_ROOT / "web" / "integrations" / "peach-jav.user.js").read_bytes()
    return Response(script, media_type="application/javascript", headers={"Cache-Control": "no-cache"})


def userscript_bridge():
    return HTMLResponse('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
                        '<meta name="peach-userscript-bridge" content="1">'
                        '<title>Peach userscript connection</title></head><body></body></html>',
                        headers={"Cache-Control": "no-store", "X-Frame-Options": "SAMEORIGIN",
                                 "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; base-uri 'none'"})


def status(code: str, service=Depends(browser_client)):
    try:
        return JSONResponse(service.status(code), headers={"Cache-Control": "no-store"})
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


def identify(source_url: str, code: str = "", service=Depends(browser_client)):
    try:
        return JSONResponse(service.status(identify_source(source_url, code)), headers={"Cache-Control": "no-store"})
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


def updates(request: Request, service=Depends(browser_client)):
    from .client_updates import snapshot
    return JSONResponse(snapshot(request.app.state.automatic_updates), headers={'Cache-Control': 'no-store'})


def people(request: Request, codes: str, performers: list[str] = Query(default=[]), service=Depends(browser_client)):
    from .web_jav_browser_people import cached_people
    try:
        result = cached_people(service.contract, request.app.state.preview_service, codes, performers)
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


def add(body: dict = Body(...), service=Depends(browser_client)):
    try:
        return JSONResponse(service.add(body), headers={"Cache-Control": "no-store"})
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


async def errors(request: Request, service=Depends(browser_client)):
    body = bytearray()
    async for part in request.stream():
        body.extend(part)
        if len(body) > 16 * 1024:
            raise HTTPException(413, "Error record too long")
    try:
        data = json.loads(body)
    except (ValueError, UnicodeError):
        raise HTTPException(400, "Invalid error record format") from None
    return JSONResponse(service.diagnostics.record(data), headers={"Cache-Control": "no-store"})


def settings(request: Request):
    return JSONResponse(request.app.state.jav_browser.settings(), headers={"Cache-Control": "no-store"})


def configure(request: Request, body: dict = Body(...)):
    try:
        return JSONResponse(request.app.state.jav_browser.configure(body), headers={"Cache-Control": "no-store"})
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


def create_router(local_only) -> APIRouter:
    router = APIRouter()
    router.add_api_route("/integrations/peach-jav.user.js", userscript, methods=["GET"])
    router.add_api_route("/integrations/peach-userscript-bridge", userscript_bridge, methods=["GET"],
                        dependencies=[Depends(require_auth)])
    router.add_api_route("/api/jav-browser", status, methods=["GET"])
    router.add_api_route("/api/jav-browser/identify", identify, methods=["GET"])
    router.add_api_route("/api/jav-browser/updates", updates, methods=["GET"])
    router.add_api_route("/api/jav-browser/people", people, methods=["GET"])
    router.add_api_route("/api/jav-browser", add, methods=["POST"])
    router.add_api_route("/api/jav-browser/errors", errors, methods=["POST"])
    permissions = [Depends(require_auth), Depends(local_only)]
    router.add_api_route("/api/configuration/jav-browser", settings, methods=["GET"], dependencies=permissions)
    router.add_api_route("/api/configuration/jav-browser", configure, methods=["POST"], dependencies=permissions)
    return router
