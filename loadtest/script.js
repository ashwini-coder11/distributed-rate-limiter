import http from 'k6/http';
import { check, sleep } from 'k6';
//import { check, sleep, expectedStatuses } from 'k6';

export const options = {
     stages: [
          { duration: '10s', target: 100 },
          { duration: '30s', target: 100 },
          { duration: '10s', target: 0 },
     ],

     summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export default function () {
     const payload = JSON.stringify({
          client_id: `load_test_client_${__VU}`,
          action: 'search_api',
     });

     const params = {
          headers: {
               'Content-Type': 'application/json'
          }
     };
     // const params = {
     //      headers: { 'Content-Type': 'application/json' },
     //      responseCallback: expectedStatuses(200, 429),
     // };

     const res = http.post(
          'http://localhost:3000/check',
          payload,
          params
     );

     check(res, {
          'status is 200 or 429': (r) =>
               r.status === 200 || r.status === 429,
     });

     sleep(0.1);
}