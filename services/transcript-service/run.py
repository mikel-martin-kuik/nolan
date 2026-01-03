#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Transcript Service - JSON RPC server
Requires: Python 3.10+
"""
import sys
import json

# CRITICAL: Version check at startup
if sys.version_info < (3, 10):
    print(json.dumps({
        "jsonrpc": "2.0",
        "id": None,
        "error": {
            "code": -32603,
            "message": f"Python 3.10+ required, found {sys.version_info.major}.{sys.version_info.minor}"
        }
    }), file=sys.stderr)
    sys.exit(1)

from transcript_service.rpc_server import JsonRpcServer

if __name__ == "__main__":
    server = JsonRpcServer()
    server.run()
