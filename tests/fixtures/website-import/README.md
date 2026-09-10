# Website importer fixtures

Retrieved directly from the public official sites on 2026-09-08 (Asia/Shanghai):

- turing-home.html: https://zju-turing.github.io/TuringCourses/
- bms-home.html: https://bms-zju.github.io/BMS_Database/
- bms-courses.html: https://bms-zju.github.io/BMS_Database/courses/

These are reduced HTML fixtures: only original anchor elements and their nested label markup are retained, wrapped in a minimal document. Course article bodies, reviews, downloads, scripts, CSS and images are excluded. The importer uses source-specific course path families and the BMS course-catalog-name labels. Fixtures prove parsing of the captured directory layout, not permanent source availability or correctness of course matching; administrators must review suggestions. Live scanning is capped at 30 candidates per run.
