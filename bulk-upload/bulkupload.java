/*
 * End-to-End Best Practice Code for Bulk CSV Update API in Spring Boot + PostgreSQL
 * Sections:
 * 1. ThreadPoolTaskExecutor Configuration
 * 2. Entities & Repositories (JobStatus, JobError)
 * 3. Controller: BulkUpdateController
 * 4. Service: BulkUpdateService
 * 5. SQL Scripts (temp table, schema check, validation, chunked update)
 */

// 1. ThreadPoolTaskExecutor Configuration
@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean(name = "bulkTaskExecutor")
    public ThreadPoolTaskExecutor bulkTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("bulk-async-");
        executor.initialize();
        return executor;
    }
}

// 2. Entities & Repositories
@Entity
@Table(name = "job_status")
public class JobStatus {
    @Id
    private UUID jobId;
    private String status;  // PENDING, PROCESSING, COMPLETED, FAILED
    private int errorCount;
    private Instant submittedAt;
    private Instant completedAt;
    // getters/setters
}

@Repository
public interface JobStatusRepository extends JpaRepository<JobStatus, UUID> {}

@Entity
@Table(name = "job_errors")
public class JobError {
    @Id @GeneratedValue
    private Long id;
    private UUID jobId;
    private int lineNumber;
    private String columnName;
    private String invalidValue;
    private String errorMsg;
    // getters/setters
}

@Repository
public interface JobErrorRepository extends JpaRepository<JobError, Long> {
    List<JobError> findByJobId(UUID jobId);
}

// 3. Controller
@RestController
@RequestMapping("/bulk-update")
public class BulkUpdateController {
    private final JobStatusRepository jobStatusRepo;
    private final BulkUpdateService bulkSvc;

    public BulkUpdateController(JobStatusRepository jobStatusRepo, BulkUpdateService bulkSvc) {
        this.jobStatusRepo = jobStatusRepo;
        this.bulkSvc = bulkSvc;
    }

    @PostMapping
    public ResponseEntity<Map<String, UUID>> uploadCsv(@RequestParam("file") MultipartFile file,
                                                        @AuthenticationPrincipal User user) {
        UUID jobId = UUID.randomUUID();
        JobStatus job = new JobStatus();
        job.setJobId(jobId);
        job.setStatus("PENDING");
        job.setSubmittedAt(Instant.now());
        jobStatusRepo.save(job);

        bulkSvc.processCsvAsync(jobId, file, user.getUsername());

        return ResponseEntity.accepted()
                .body(Collections.singletonMap("jobId", jobId));
    }

    @GetMapping("/{jobId}/errors")
    public List<JobError> fetchErrors(@PathVariable UUID jobId) {
        return jobErrorRepo.findByJobId(jobId);
    }
}

// 4. Service
@Service
public class BulkUpdateService {
    private static final List<String> ALLOWED_COLUMNS = List.of(
        "col1", "col2", /* ... all 40 columns ... */
    );
    private final DataSource dataSource;
    private final NamedParameterJdbcTemplate jdbc;
    private final JobStatusRepository jobStatusRepo;
    private final JobErrorRepository jobErrorRepo;

    public BulkUpdateService(DataSource dataSource,
                             NamedParameterJdbcTemplate jdbc,
                             JobStatusRepository jobStatusRepo,
                             JobErrorRepository jobErrorRepo) {
        this.dataSource = dataSource;
        this.jdbc = jdbc;
        this.jobStatusRepo = jobStatusRepo;
        this.jobErrorRepo = jobErrorRepo;
    }

    @Async("bulkTaskExecutor")
    public void processCsvAsync(UUID jobId, MultipartFile file, String username) {
        updateStatus(jobId, "PROCESSING");
        try (Connection conn = dataSource.getConnection()) {
            // 6. Schema Drift Guard
            validateSchema(conn, file);
            // 2. Create & Load Temp Table
            createTempTable(conn);
            runCopy(conn, file);
            // 3. Batch Validation
            performValidations(conn, jobId);
            // 4. Error Handling & Thresholds
            int errors = jobErrorRepo.countByJobId(jobId);
            if (errors > 0) {
                updateStatus(jobId, "FAILED", errors);
                return;
            }
            // 5. Chunked Bulk Update
            chunkedUpdate(conn, username);
            updateStatus(jobId, "COMPLETED");
        } catch (Exception ex) {
            updateStatus(jobId, "FAILED");
            // log exception
        }
    }

    private void validateSchema(Connection conn, MultipartFile file) {
        // read CSV header, compare to ALLOWED_COLUMNS via information_schema
        // throw exception on mismatch
    }

    private void createTempTable(Connection conn) throws SQLException {
        String ddl = "CREATE UNLOGGED TEMP TABLE temp_upload ( " +
            "csv_id SERIAL PRIMARY KEY, pk_col BIGINT, " +
            ALLOWED_COLUMNS.stream().map(c -> c + " TEXT").collect(Collectors.joining(", ")) +
            ", line_number INT" +
            ");";
        conn.createStatement().execute(ddl);
    }

    private void runCopy(Connection conn, MultipartFile file) throws SQLException, IOException {
        CopyManager copyMgr = new CopyManager((BaseConnection) conn);
        String cols = Stream.concat(Stream.of("pk_col"), ALLOWED_COLUMNS.stream())
            .collect(Collectors.joining(", "));
        copyMgr.copyIn(
            "COPY temp_upload(pk_col, " + cols + ", line_number) FROM STDIN WITH (FORMAT csv, HEADER)",
            file.getInputStream()
        );
    }

    private void performValidations(Connection conn, UUID jobId) throws SQLException {
        for (String col : List.of("col1", /* ... 15 complex columns ... */)) {
            // a) Extract distinct
            String tmpVals = "CREATE TEMP TABLE vals_" + col + " AS SELECT DISTINCT " + col + " FROM temp_upload;";
            conn.createStatement().execute(tmpVals);

            // b) Validate
            String validationSql = "INSERT INTO job_errors(job_id, line_number, column_name, invalid_value, error_msg) " +
                "SELECT '" + jobId + "'::uuid, t.line_number, '" + col + "', t." + col + ", 'Not found' " +
                "FROM vals_" + col + " v " +
                "LEFT JOIN reference_" + col + " r ON LOWER(TRIM(v." + col + ")) = LOWER(TRIM(r.name)) " +
                "JOIN temp_upload t USING(" + col + ") WHERE r.id IS NULL;";
            conn.createStatement().execute(validationSql);
        }
    }

    private void chunkedUpdate(Connection conn, String username) throws SQLException {
        int chunkSize = 2000;
        Integer maxId = jdbc.queryForObject("SELECT max(csv_id) FROM temp_upload", Collections.emptyMap(), Integer.class);
        for (int start = 1; start <= maxId; start += chunkSize) {
            int end = start + chunkSize - 1;
            // 7. Audit Trail inside chunk
            String auditSql = "INSERT INTO main_table_history(pk_col, changed_at, changed_by, old_values, new_values) " +
                "SELECT m.pk_col, NOW(), '" + username + "', row_to_json(m), row_to_json(t) " +
                "FROM main_table m JOIN temp_upload t " +
                "ON m.pk_col = t.pk_col AND t.csv_id BETWEEN " + start + " AND " + end + ";";
            conn.createStatement().execute(auditSql);

            // Update chunk
            String colsSql = ALLOWED_COLUMNS.stream()
                .map(c -> c + " = t." + c)
                .collect(Collectors.joining(", ")); 
            String updateSql = String.format(
                "UPDATE main_table m SET %s FROM temp_upload t WHERE m.pk_col = t.pk_col AND t.csv_id BETWEEN %d AND %d;",
                colsSql, start, end
            );
            conn.createStatement().execute(updateSql);
            conn.commit();
        }
    }

    private void updateStatus(UUID jobId, String status) {
        updateStatus(jobId, status, null);
    }
    private void updateStatus(UUID jobId, String status, Integer errorCount) {
        JobStatus job = jobStatusRepo.findById(jobId).orElseThrow();
        job.setStatus(status);
        if (errorCount != null) job.setErrorCount(errorCount);
        if ("COMPLETED".equals(status)) job.setCompletedAt(Instant.now());
        jobStatusRepo.save(job);
    }
}

// 5. SQL Scripts (for reference)
/*
-- Schema Drift Guard
SELECT column_name FROM information_schema.columns
WHERE table_name = 'main_table'
  AND column_name NOT IN ('pk_col', /*...*/ 'additional columns')
ORDER BY ordinal_position;

-- Temp Table Creation
CREATE UNLOGGED TEMP TABLE temp_upload (...);

-- Validation Example
INSERT INTO job_errors(...) SELECT ...;

-- Chunked Update & Audit
INSERT INTO main_table_history(...);
UPDATE main_table m SET ...;
*/
