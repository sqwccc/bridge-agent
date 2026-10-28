"""Call the local IntelliJ IDEA MCP server using its advertised tools."""
import argparse
import json
import urllib.request


class IdeaMcp:
    def __init__(self, url):
        self.url = url
        self.session = None
        self.sequence = 0
        self.request("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "bridge-agent", "version": "1"},
        })
        self.request("notifications/initialized", notification=True)

    def request(self, method, params=None, notification=False):
        self.sequence += 1
        payload = {"jsonrpc": "2.0", "method": method}
        if not notification:
            payload["id"] = self.sequence
        if params is not None:
            payload["params"] = params
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if self.session:
            headers["Mcp-Session-Id"] = self.session
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode(), headers=headers)
        with urllib.request.urlopen(req, timeout=180) as response:
            self.session = response.headers.get("Mcp-Session-Id", self.session)
            if response.status == 202:
                return None
            if "event-stream" in response.headers.get("Content-Type", ""):
                for line in response:
                    if line.startswith(b"data:"):
                        result = json.loads(line[5:])
                        if result.get("id") == self.sequence:
                            return result
            else:
                return json.load(response)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:64343/stream")
    parser.add_argument("tool", nargs="?")
    parser.add_argument("arguments", nargs="?", default="{}")
    args = parser.parse_args()
    client = IdeaMcp(args.url)
    result = client.request("tools/call", {"name": args.tool, "arguments": json.loads(args.arguments)}) if args.tool else client.request("tools/list", {})
    print(json.dumps(result, ensure_ascii=False, indent=2))
