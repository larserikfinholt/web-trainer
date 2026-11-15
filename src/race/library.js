import { courseDefinitions } from './courses.js';
import { buildCourse } from './geometry.js';

const courses = courseDefinitions.map(def => buildCourse(def));

function getCourse(id) {
    return courses.find(c => c.id === id) ?? courses[0];
}

export { courses, getCourse };
