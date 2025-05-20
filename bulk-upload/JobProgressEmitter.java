1. Add an SseEmitter Registry
In your service (or a dedicated component), keep a map of jobId → SseEmitter:

java
Copy
Edit
@Component
public class JobProgressEmitter {
    private final ConcurrentMap<UUID, SseEmitter> emitters = new ConcurrentHashMap<>();

    public SseEmitter createEmitter(UUID jobId) {
        SseEmitter emitter = new SseEmitter(0L); // no timeout
        emitter.onCompletion(() -> emitters.remove(jobId));
        emitter.onTimeout(()    -> emitters.remove(jobId));
        emitters.put(jobId, emitter);
        return emitter;
    }

    public void sendProgress(UUID jobId, String event, Object data) {
        SseEmitter emitter = emitters.get(jobId);
        if (emitter != null) {
            try {
                emitter.send(SseEmitter.event()
                    .name(event)
                    .data(data));
            } catch (IOException e) {
                emitters.remove(jobId);
            }
        }
    }
}
2. Expose an SSE Endpoint in Your Controller
java
Copy
Edit
@RestController
@RequestMapping("/bulk-update")
public class BulkUpdateController {
    // … existing injections …

    private final JobProgressEmitter progressEmitter;

    public BulkUpdateController(JobStatusRepository jobStatusRepo,
                                JobErrorRepository jobErrorRepo,
                                BulkUpdateService bulkSvc,
                                JobProgressEmitter progressEmitter) {
        // …  
        this.progressEmitter = progressEmitter;
    }

    // New: subscribe to events for a given job
    @GetMapping(value = "/{jobId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamJobProgress(@PathVariable UUID jobId) {
        return progressEmitter.createEmitter(jobId);
    }

    // … existing endpoints …
}
3. Emit Progress During Processing
Inside your BulkUpdateService.processCsvAsync(...), sprinkle calls to progressEmitter.sendProgress(...) at key points:

java
Copy
Edit
@Async("bulkTaskExecutor")
public void processCsvAsync(UUID jobId, MultipartFile file, String username) {
    updateStatus(jobId, "PROCESSING");
    progressEmitter.sendProgress(jobId, "status", "Started processing");

    try (Connection conn = dataSource.getConnection()) {
        // 6. Schema Drift Guard
        progressEmitter.sendProgress(jobId, "step", "Validating schema");
        validateSchema(conn, file);

        // 2. Create & Load Temp Table
        progressEmitter.sendProgress(jobId, "step", "Creating temp table");
        createTempTable(conn);
        progressEmitter.sendProgress(jobId, "step", "Loading CSV via COPY");
        runCopy(conn, file);

        // 3. Batch Validation
        for (int i = 0; i < complexCols.size(); i++) {
            String col = complexCols.get(i);
            progressEmitter.sendProgress(jobId, "validation", 
                String.format("Validating column %s (%d/%d)", col, i+1, complexCols.size()));
            performValidationForColumn(conn, jobId, col);
        }

        int errors = jobErrorRepo.countByJobId(jobId);
        progressEmitter.sendProgress(jobId, "validation.complete", errors);

        if (errors > 0) {
            updateStatus(jobId, "FAILED", errors);
            progressEmitter.sendProgress(jobId, "status", "Failed: errors found");
            return;
        }

        // 5. Chunked Bulk Update
        int chunkSize = 2000;
        int maxId = jdbc.queryForObject("SELECT max(csv_id) FROM temp_upload", Integer.class);
        int chunks = (maxId / chunkSize) + 1;
        for (int chunk = 0; chunk < chunks; chunk++) {
            int start = chunk * chunkSize + 1;
            int end   = Math.min(start + chunkSize - 1, maxId);
            progressEmitter.sendProgress(jobId, "updating", 
                String.format("Updating rows %d–%d", start, end));
            chunkedUpdateRange(conn, username, start, end);
            progressEmitter.sendProgress(jobId, "updating.chunk", chunk + 1);
        }

        updateStatus(jobId, "COMPLETED");
        progressEmitter.sendProgress(jobId, "status", "Completed");
    } catch (Exception ex) {
        updateStatus(jobId, "FAILED");
        progressEmitter.sendProgress(jobId, "status", "Failed with exception");
        // log ex…
    }
}
4. UI Side (Sketch)
js
Copy
Edit
const evtSource = new EventSource(`/bulk-update/${jobId}/events`);
evtSource.addEventListener('status', e => console.log('Status:', e.data));
evtSource.addEventListener('validation', e => console.log('Validation:', e.data));
evtSource.addEventListener('updating', e => console.log('Update:', e.data));