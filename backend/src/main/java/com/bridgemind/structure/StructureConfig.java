package com.bridgemind.structure;

import java.util.List;
public record StructureConfig(long version, String shape, List<Part> parts) {
    public record Binding(String pointId, String deviceId, String metric) {}
    public record Part(String id, String zone, String name, String description, String anchor, List<Binding> bindings) {}
}
