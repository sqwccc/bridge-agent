package com.bridgemind.agent;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;

/** Temporary, session-isolated completed answers; process restart clears everything. */
final class AgentMaintenanceAnswerCache {
    record Key(String session, String request, LocalDate day) {}
    record Answer(AgentPlan plan, AgentEvidence.Evidence evidence,
                  AgentPresentation.Visualization chart, String text, Instant generatedAt) {}
    private final Cache<Key,String> entries = Caffeine.newBuilder().maximumSize(64)
            .expireAfterWrite(Duration.ofMinutes(30)).build();
    private final JsonMapper json;
    private final Clock clock;
    AgentMaintenanceAnswerCache(JsonMapper json) { this(json,Clock.systemUTC()); }
    AgentMaintenanceAnswerCache(JsonMapper json,Clock clock) { this.json=json;this.clock=clock; }
    Key key(String session,AgentStreamController.Question question) {
        return new Key(session,json.writeValueAsString(new AgentStreamController.Question(question.question(),question.scope(),
                question.bridgeId(),question.pageFilters(),question.from(),question.to(),null,question.answerMode())),
                LocalDate.now(clock.withZone(ZoneId.of("Asia/Shanghai"))));
    }
    Answer get(Key key,int seconds) {
        if(seconds<=0)return null;
        var encoded=entries.getIfPresent(key);
        if(encoded==null)return null;
        var answer=json.readValue(encoded,Answer.class);
        if(!clock.instant().isBefore(answer.generatedAt().plusSeconds(Math.min(seconds,1800)))) {
            entries.invalidate(key);return null;
        }
        return answer;
    }
    void put(Key key,AgentPlan plan,AgentEvidence.Evidence evidence,AgentPresentation.Visualization chart,String text) {
        if(!plan.route().equals("business_query")||!plan.topic().equals("maintenance_plan")||evidence==null||text.isBlank())return;
        entries.put(key,json.writeValueAsString(new Answer(plan,evidence,chart,text,clock.instant())));
    }
}
