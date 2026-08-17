# Description
The `preferencies` microservice is a fake microservice thet will be used in the future.

# API
- A simple `GET` endpoint on the `/events` path that return a list of events retrived
  by the following call:
  ```
    curl 'https://agendatrad.org/calendar/map.json' \
    --compressed \
    -X POST \
    -H 'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0' \
    -H 'Accept: */*' \
    -H 'Accept-Language: it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7' \
    -H 'Accept-Encoding: gzip, deflate, br, zstd' \
    -H 'Content-Type: multipart/form-data; boundary=----geckoformboundarydb99db75a3aaa440786d0c211ca390e3' \
    -H 'Referer: https://agendatrad.org/calendar/map' \
    -H 'Origin: https://agendatrad.org' \
    -H 'Sec-Fetch-Dest: empty' \
    -H 'Sec-Fetch-Mode: cors' \
    -H 'Sec-Fetch-Site: same-origin' \
    -H 'Connection: keep-alive' \
    -H 'Cookie: session=131bk4mp38v1p90on005pq0b4vokprk3; _pk_ref.3.b685=%5B%22%22%2C%22%22%2C1787003739%2C%22https%3A%2F%2Fwww.google.com%2F%22%5D; _pk_id.3.b685=623960c7a76893df.1787003739.; _pk_ses.3.b685=1' \
    --data-binary \
    $'------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="_method"\r\n\r\nPOST\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[Event][date_startInput]"\r\n\r\n17/08/2026\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[Event][date_start]"\r\n\r\n2026-08-17\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[Event][bounds]"\r\n\r\n-4.526367187500001,30.637912028341123,29.970703125000004,50.42951794712289\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[Event][zoom]"\r\n\r\n5\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[Check][types]"\r\n\r\n1\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType]"\r\n\r\n\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n2\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n12\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n6\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n1\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n4\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n11\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n8\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n9\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n3\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3\r\nContent-Disposition: form-data; name="data[EventType][EventType][]"\r\n\r\n5\r\n------geckoformboundarydb99db75a3aaa440786d0c211ca390e3--\r\n'
  ```
  The request is done at microservice startup and cached for ten minutes. If the cache expire it will be updated at the next request.


