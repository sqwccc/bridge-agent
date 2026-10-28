package com.bridgemind.bridge.model.resp;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

/**
 * 保留原有根字段，档案扩展放在 archive；列表无需携带完整档案。
 */
public record BridgeDetailResponse(@JsonUnwrapped BridgeResponse bridge, BridgeArchive archive) {
}
